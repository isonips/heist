// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title HeistPlay
/// @notice The `perRun` payment path (P7): a player pays `playPrice` of
/// USDG per game, signed as one transaction, no prior deposit needed.
/// This is the contract-side half of what the brief described directly:
/// "le joueur signe une transaction pour jouer... les fonds sont envoyés
/// dans le smart contract de HEIST qui répartit les fonds" — lucky draw
/// + in-game payouts (loot) + treasury.
///
/// The treasury cut moves immediately, on every `play()` call — it's the
/// one split that never depends on how the game turns out. The other two
/// buckets (loot budget, draw pot) are NOT split into separate on-chain
/// balances: they stay pooled in this contract's own USDG balance, and
/// the off-chain ledger (see DECISIONS.md P5 — `ledger` table, reasons
/// `loot`/`prize`) is what actually tracks which portion is earmarked
/// for what — acceptable per explicit instruction, on one condition:
/// every `payout()` enforces a solvency invariant (never pays out more
/// than the pool actually holds — see below) plus per-tx/daily caps, so
/// a compromised `operator` key costs at most one day of pool, not the
/// whole thing.
///
/// This contract never decides who gets paid or how much on its own — it
/// only custodies funds and executes a payout when `operator` (the
/// backend, after server-side replay verification — see P5) tells it to.
/// `runId`/`ref` are the same idempotency keys the off-chain ledger uses
/// (its `unique(reason, ref)` constraint), mirrored here so a retried
/// call can never double-charge a player or double-pay a winner.
///
/// USDG note: read `usdg.decimals()` off-chain when computing
/// `playPrice`/caps to pass in here — this contract stores and moves raw
/// token units only, it has no opinion on decimals, and USDG uses 6, not
/// the more common 18 (see DECISIONS.md P10).
contract HeistPlay is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdg;

    address public owner;
    address public pendingOwner;
    address public operator;

    address public treasury;
    address public pendingTreasury;
    uint256 public playPrice;
    uint256 public treasuryBps; // out of 10_000

    uint256 public maxPayoutPerTx;
    uint256 public maxPayoutPerDay;
    mapping(uint256 => uint256) public payoutsByDay; // day index (block.timestamp / 1 days) => cumulative payout

    mapping(bytes32 => bool) public playedRuns;
    mapping(bytes32 => bool) public paidRefs;

    event Played(address indexed player, bytes32 indexed runId, uint256 amount, uint256 treasuryCut, uint256 pooled);
    event Payout(address indexed to, bytes32 indexed ref, uint256 amount, string reason);
    event ConfigUpdated(uint256 playPrice, uint256 treasuryBps);
    event PayoutLimitsUpdated(uint256 maxPayoutPerTx, uint256 maxPayoutPerDay);
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event OwnerTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event TreasuryTransferStarted(address indexed previousTreasury, address indexed newTreasury);
    event TreasuryTransferred(address indexed previousTreasury, address indexed newTreasury);

    error NotOwner();
    error NotPendingOwner();
    error NotPendingTreasury();
    error NotOperator();
    error ZeroAddress();
    error ZeroAmount();
    error BpsTooHigh();
    error AlreadyPlayed();
    error AlreadyPaid();
    error UnknownReason();
    error OwnerOperatorMustDiffer();
    error ExceedsPerTxLimit(uint256 amount, uint256 max);
    error ExceedsDailyLimit(uint256 amount, uint256 spentToday, uint256 max);
    error InsufficientPool(uint256 available, uint256 requested);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    /// @param _treasury May be the zero address at deploy time — the real
    /// multisig doesn't exist yet in every case, and this must never be
    /// hardcoded permanently. `play()` refuses to run while it's unset;
    /// `owner` sets the real one afterward via the same 2-step handoff
    /// used to change it later (see proposeTreasury/acceptTreasury) —
    /// there is no plain single-step setter for this address, ever.
    constructor(
        IERC20 _usdg,
        address _owner,
        address _operator,
        address _treasury,
        uint256 _playPrice,
        uint256 _treasuryBps,
        uint256 _maxPayoutPerTx,
        uint256 _maxPayoutPerDay
    ) {
        if (_owner == address(0) || _operator == address(0)) revert ZeroAddress();
        if (_owner == _operator) revert OwnerOperatorMustDiffer();
        if (_treasuryBps > 10_000) revert BpsTooHigh();
        usdg = _usdg;
        owner = _owner;
        operator = _operator;
        treasury = _treasury;
        playPrice = _playPrice;
        treasuryBps = _treasuryBps;
        maxPayoutPerTx = _maxPayoutPerTx;
        maxPayoutPerDay = _maxPayoutPerDay;
        emit OwnerTransferred(address(0), _owner);
        emit OperatorUpdated(address(0), _operator);
        emit TreasuryTransferred(address(0), _treasury);
        emit ConfigUpdated(_playPrice, _treasuryBps);
        emit PayoutLimitsUpdated(_maxPayoutPerTx, _maxPayoutPerDay);
    }

    /// @notice Pay to play one game. `runId` is the same run identifier
    /// the off-chain ticket/ledger use — reusing it here means a single
    /// on-chain event log is enough to cross-reference a payment against
    /// its game's eventual server-verified outcome. Reverts on a repeat
    /// runId rather than silently no-op-ing, so a client retry surfaces
    /// as an obvious error instead of looking like it worked twice.
    /// Reverting here means nothing is debited and nothing is recorded —
    /// there is no partial-application case, the EVM's own atomicity is
    /// the guarantee (see DECISIONS.md P10b).
    function play(bytes32 runId) external nonReentrant {
        if (treasury == address(0)) revert ZeroAddress();
        if (playedRuns[runId]) revert AlreadyPlayed();
        playedRuns[runId] = true;
        uint256 amount = playPrice;
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        uint256 cut = (amount * treasuryBps) / 10_000;
        if (cut > 0) usdg.safeTransfer(treasury, cut);
        emit Played(msg.sender, runId, amount, cut, amount - cut);
    }

    /// @notice Pay out a loot or prize amount from the pooled balance.
    /// Only `operator` — the backend, and only after it has independently
    /// verified the outcome (replay(), see P5) — can call this; the
    /// contract itself has no opinion on whether a payout is justified,
    /// same as HaulLedger not inspecting what it records. Idempotent on
    /// `ref` (a runId for `loot`, `draw:<day>` for `prize` — the same
    /// refs the off-chain ledger already uses).
    ///
    /// `operator` is a hot key (lives in server env vars, signs every
    /// payout) — the per-tx and daily caps below are what a compromised
    /// or misbehaving copy of that key actually costs: at most one
    /// transaction over the per-tx cap, or one day's worth over the
    /// daily cap, never the whole pool. The solvency check is a third,
    /// independent guard: even a call that passes both caps can never
    /// move more than the pool actually holds.
    function payout(address to, bytes32 ref, uint256 amount, string calldata reason) external onlyOperator nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (paidRefs[ref]) revert AlreadyPaid();
        bytes32 reasonHash = keccak256(bytes(reason));
        if (reasonHash != keccak256(bytes("loot")) && reasonHash != keccak256(bytes("prize"))) revert UnknownReason();
        if (amount > maxPayoutPerTx) revert ExceedsPerTxLimit(amount, maxPayoutPerTx);

        uint256 day = block.timestamp / 1 days;
        uint256 spentToday = payoutsByDay[day];
        if (spentToday + amount > maxPayoutPerDay) revert ExceedsDailyLimit(amount, spentToday, maxPayoutPerDay);

        uint256 available = usdg.balanceOf(address(this));
        if (amount > available) revert InsufficientPool(available, amount);

        paidRefs[ref] = true;
        payoutsByDay[day] = spentToday + amount;
        usdg.safeTransfer(to, amount);
        emit Payout(to, ref, amount, reason);
    }

    /// @notice The pooled balance available for future loot/prize
    /// payouts — everything this contract holds, since the treasury cut
    /// already left on each `play()` call.
    function pooledBalance() external view returns (uint256) {
        return usdg.balanceOf(address(this));
    }

    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        if (newOperator == owner) revert OwnerOperatorMustDiffer();
        address previous = operator;
        operator = newOperator;
        emit OperatorUpdated(previous, newOperator);
    }

    function setConfig(uint256 newPlayPrice, uint256 newTreasuryBps) external onlyOwner {
        if (newTreasuryBps > 10_000) revert BpsTooHigh();
        playPrice = newPlayPrice;
        treasuryBps = newTreasuryBps;
        emit ConfigUpdated(newPlayPrice, newTreasuryBps);
    }

    function setPayoutLimits(uint256 newMaxPerTx, uint256 newMaxPerDay) external onlyOwner {
        maxPayoutPerTx = newMaxPerTx;
        maxPayoutPerDay = newMaxPerDay;
        emit PayoutLimitsUpdated(newMaxPerTx, newMaxPerDay);
    }

    /// @notice Step 1 of a 2-step treasury handoff — `owner`-only to
    /// propose, but only the nominated address itself can accept (same
    /// guard as owner/recorder elsewhere: a typo'd proposal changes
    /// nothing until something that controls the new address confirms
    /// it). This is the *only* way `treasury` ever changes — there is no
    /// single-step setter, on purpose, so it can never be hardcoded or
    /// silently swapped in one call.
    function proposeTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        pendingTreasury = newTreasury;
        emit TreasuryTransferStarted(treasury, newTreasury);
    }

    function acceptTreasury() external {
        if (msg.sender != pendingTreasury) revert NotPendingTreasury();
        address previous = treasury;
        treasury = pendingTreasury;
        pendingTreasury = address(0);
        emit TreasuryTransferred(previous, treasury);
    }

    /// @notice Step 1 of a 2-step owner handoff — see HaulLedger's
    /// recorder for the same pattern and why (guards against a typo'd
    /// address permanently locking out config changes).
    function proposeOwner(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        if (newOwner == operator) revert OwnerOperatorMustDiffer();
        pendingOwner = newOwner;
        emit OwnerTransferStarted(owner, newOwner);
    }

    function acceptOwner() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previous = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnerTransferred(previous, owner);
    }
}
