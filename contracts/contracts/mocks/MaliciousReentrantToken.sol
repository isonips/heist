// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Vault} from "../Vault.sol";

/// @notice Test-only. A token that calls back into Vault.withdraw() from
/// inside its own transfer(), simulating a malicious/non-standard token
/// (real USDG is assumed not to do this — but Vault shouldn't rely on that
/// assumption alone). Used to prove the nonReentrant guard actually stops
/// a reentrant double-withdraw, not just that the happy path works.
contract MaliciousReentrantToken is ERC20 {
    Vault public target;
    uint256 public reentrantAmount;
    bool public attack;

    constructor() ERC20("Evil", "EVIL") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setAttack(Vault _target, uint256 _reentrantAmount, bool _attack) external {
        target = _target;
        reentrantAmount = _reentrantAmount;
        attack = _attack;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (attack) {
            attack = false; // one reentry only, avoid infinite recursion
            target.withdraw(reentrantAmount);
        }
        return super.transfer(to, amount);
    }
}
