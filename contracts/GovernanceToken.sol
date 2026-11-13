// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Time} from "@openzeppelin/contracts/utils/types/Time.sol";

/// @notice Fixed-supply demo governance token with opt-in delegation.
contract GovernanceToken is ERC20Votes {
    /// @param a Recipient of 400 GOV.
    /// @param b Recipient of 300 GOV.
    /// @param c Recipient of 200 GOV.
    /// @param d Recipient of 100 GOV.
    constructor(address a, address b, address c, address d)
        ERC20("Governance Token", "GOV")
        EIP712("Governance Token", "1")
    {
        _mint(a, 400 ether);
        _mint(b, 300 ether);
        _mint(c, 200 ether);
        _mint(d, 100 ether);
    }

    /// @notice ERC-6372 clock shared with the future Governor.
    function clock() public view override returns (uint48) {
        return Time.timestamp();
    }

    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }
}
