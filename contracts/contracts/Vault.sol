// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Vault
/// @notice Custodies USDG deposits and lets each depositor withdraw their
/// own balance at any time. Deliberately has NO owner, NO pause, and NO
/// function anywhere that can move, freeze, or block a withdrawal of a
/// user's own recorded balance — "retrait toujours possible sans
/// permission" is a property of the contract's surface, not a policy this
/// contract could later choose to override. It doesn't mint anything, hold
/// an opinion about game outcomes, or know what HEIST is — it only tracks
/// "who deposited how much of this token, and how much have they taken
/// back out." Off-chain accounting (how much of a deposit a player has
/// "spent" on games) lives entirely off-chain (see DECISIONS.md P10) —
/// this contract has no concept of it, on purpose, so a bug in that
/// accounting can never strand or block a real withdrawal here.
contract Vault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdg;

    mapping(address => uint256) public balanceOf;

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);

    error ZeroAmount();
    error InsufficientBalance(uint256 available, uint256 requested);

    constructor(IERC20 _usdg) {
        usdg = _usdg;
    }

    /// @notice Deposit `amount` of USDG, credited to the caller's own
    /// balance. Requires an ERC20 approval beforehand, same as any
    /// transferFrom-based deposit.
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        balanceOf[msg.sender] += amount;
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw up to the caller's own recorded balance. No admin,
    /// no allowlist, no pause — this is the one function in the contract
    /// that must never gain a permission check.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 available = balanceOf[msg.sender];
        if (amount > available) revert InsufficientBalance(available, amount);
        // Effects before interaction — balance is debited before the
        // external call, so a reentrant withdraw() sees the reduced
        // balance (belt-and-suspenders alongside the nonReentrant guard).
        unchecked {
            balanceOf[msg.sender] = available - amount;
        }
        usdg.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }
}
