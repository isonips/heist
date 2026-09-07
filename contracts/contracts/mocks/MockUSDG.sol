// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Standard ERC20 stand-in for USDG, test-only. Anyone can mint —
/// there is no real supply/economics being tested here, only Vault's
/// custody logic against a normal token implementation.
contract MockUSDG is ERC20 {
    constructor() ERC20("Mock USDG", "mUSDG") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
