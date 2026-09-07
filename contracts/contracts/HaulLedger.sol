// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HaulLedger
/// @notice An append-only log of loot batches, written by a single trusted
/// "recorder" (the HEIST backend). It records that a batch of kept loot
/// existed at a point in time — a Merkle root over the batch's entries,
/// not the entries themselves (cheaper, and lets the server prove
/// inclusion of any one item later without ever having put player-level
/// detail on chain). It does NOT mint, hold, or move anything — see
/// DECISIONS.md P10: this is deliberately the smallest possible contract
/// that makes a later retroactive mint auditable, not a token contract
/// itself.
///
/// Append-only is a property of the function surface, not a convention:
/// there is no function anywhere that can change or remove a batch once
/// recorded. The recorder role exists only to control who may APPEND, and
/// even that can be moved (not just revoked into nothing) via a two-step
/// handoff, so a compromised or retiring recorder key can be rotated
/// without anyone being able to rewrite history.
contract HaulLedger {
    address public recorder;
    address public pendingRecorder;

    uint256 public batchCount;
    mapping(uint256 => bytes32) public batchRoot;
    mapping(uint256 => uint256) public batchTimestamp;

    event BatchRecorded(uint256 indexed batchId, bytes32 root, uint256 timestamp);
    event RecorderTransferStarted(address indexed previousRecorder, address indexed newRecorder);
    event RecorderTransferred(address indexed previousRecorder, address indexed newRecorder);

    error NotRecorder();
    error NotPendingRecorder();
    error ZeroAddress();
    error ZeroRoot();

    modifier onlyRecorder() {
        if (msg.sender != recorder) revert NotRecorder();
        _;
    }

    constructor(address _recorder) {
        if (_recorder == address(0)) revert ZeroAddress();
        recorder = _recorder;
        emit RecorderTransferred(address(0), _recorder);
    }

    /// @notice Append one batch to the ledger. `root` is expected to be a
    /// Merkle root (or any collision-resistant commitment) over the
    /// batch's off-chain records — this contract never inspects it, only
    /// stores it against a monotonically increasing batchId.
    function recordBatch(bytes32 root) external onlyRecorder returns (uint256 batchId) {
        if (root == bytes32(0)) revert ZeroRoot();
        batchId = batchCount;
        batchRoot[batchId] = root;
        batchTimestamp[batchId] = block.timestamp;
        unchecked {
            batchCount = batchId + 1;
        }
        emit BatchRecorded(batchId, root, block.timestamp);
    }

    /// @notice Step 1 of a 2-step recorder handoff: the current recorder
    /// nominates a successor. Nothing changes until step 2.
    function proposeRecorder(address newRecorder) external onlyRecorder {
        if (newRecorder == address(0)) revert ZeroAddress();
        pendingRecorder = newRecorder;
        emit RecorderTransferStarted(recorder, newRecorder);
    }

    /// @notice Step 2: only the nominated address can complete the
    /// handoff, by accepting it itself — guards against proposing a typo'd
    /// address and permanently losing the recorder role.
    function acceptRecorder() external {
        if (msg.sender != pendingRecorder) revert NotPendingRecorder();
        address previous = recorder;
        recorder = pendingRecorder;
        pendingRecorder = address(0);
        emit RecorderTransferred(previous, recorder);
    }
}
