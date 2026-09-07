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
/// for what. That's a deliberate mirror of how the off-chain system
/// already works (one `ledger` table, `reason` distinguishes the kind of
/// movement, not separate tables) rather than a shortcut — pooling
/// avoids needing an on-chain notion of "today's pot" the contract would
/// have no way to compute correctly anyway (that requires knowing every
/// game's outcome, which only replay() — off-chain — can determine).
///
/// This contract never decides who gets paid or how much on its own — it
/// only custodies funds and executes a payout when `operator` (the
/// backend, after server-side replay verification — see P5) tells it to.
/// `runId`/`ref` are the same idempotency keys the off-chain ledger uses
/// (its `unique(reason, ref)` constraint), mirrored here so a retried
/// call can never double-charge a player or double-pay a winner.
contract HeistPlay is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdg;

    address public owner;
    address public pendingOwner;
    address public operator;

    address public treasury;
    uint256 public playPrice;
    uint256 public treasuryBps; // out of 10_000

    mapping(bytes32 => bool) public playedRuns;
    mapping(bytes32 => bool) public paidRefs;

    event Played(address indexed player, bytes32 indexed runId, uint256 amount, uint256 treasuryCut, uint256 pooled);
    event Payout(address indexed to, bytes32 indexed ref, uint256 amount, string reason);
    event ConfigUpdated(address treasury, uint256 playPrice, uint256 treasuryBps);
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event OwnerTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotPendingOwner();
    error NotOperator();
    error ZeroAddress();
    error ZeroAmount();
    error BpsTooHigh();
    error AlreadyPlayed();
    error AlreadyPaid();
    error UnknownReason();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(IERC20 _usdg, address _owner, address _operator, address _treasury, uint256 _playPrice, uint256 _treasuryBps) {
        if (_owner == address(0) || _operator == address(0) || _treasury == address(0)) revert ZeroAddress();
        if (_treasuryBps > 10_000) revert BpsTooHigh();
        usdg = _usdg;
        owner = _owner;
        operator = _operator;
        treasury = _treasury;
        playPrice = _playPrice;
        treasuryBps = _treasuryBps;
        emit OwnerTransferred(address(0), _owner);
        emit OperatorUpdated(address(0), _operator);
        emit ConfigUpdated(_treasury, _playPrice, _treasuryBps);
    }

    /// @notice Pay to play one game. `runId` is the same run identifier
    /// the off-chain ticket/ledger use — reusing it here means a single
    /// on-chain event log is enough to cross-reference a payment against
    /// its game's eventual server-verified outcome. Reverts on a repeat
    /// runId rather than silently no-op-ing, so a client retry surfaces
    /// as an obvious error instead of looking like it worked twice.
    function play(bytes32 runId) external nonReentrant {
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
    function payout(address to, bytes32 ref, uint256 amount, string calldata reason) external onlyOperator nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (paidRefs[ref]) revert AlreadyPaid();
        bytes32 reasonHash = keccak256(bytes(reason));
        if (reasonHash != keccak256(bytes("loot")) && reasonHash != keccak256(bytes("prize"))) revert UnknownReason();
        paidRefs[ref] = true;
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
        address previous = operator;
        operator = newOperator;
        emit OperatorUpdated(previous, newOperator);
    }

    function setConfig(address newTreasury, uint256 newPlayPrice, uint256 newTreasuryBps) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        if (newTreasuryBps > 10_000) revert BpsTooHigh();
        treasury = newTreasury;
        playPrice = newPlayPrice;
        treasuryBps = newTreasuryBps;
        emit ConfigUpdated(newTreasury, newPlayPrice, newTreasuryBps);
    }

    /// @notice Step 1 of a 2-step owner handoff — see HaulLedger's
    /// recorder for the same pattern and why (guards against a typo'd
    /// address permanently locking out config changes).
    function proposeOwner(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
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
