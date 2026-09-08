// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice 6-decimal ERC20 stand-in for the real USDG (DECISIONS.md P10 —
/// USDG uses 6 decimals, not the ERC20-default 18; verified on-chain via
/// decimals() against the real token). Symbol matches the real one too,
/// so this can exercise scripts/verifyToken.js's checks in tests without
/// touching a live RPC. Used to prove HeistPlay moves amounts correctly
/// regardless of the token's own decimals — it never assumes 18.
contract MockUSDG6 is ERC20 {
    constructor() ERC20("Mock USDG (6dp)", "USDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
