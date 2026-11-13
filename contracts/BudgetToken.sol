// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply, fee-free demo budget currency.
contract BudgetToken is ERC20 {
    /// @param initialHolder Distribution wallet; later transfers 10,000 BUD to Treasury.
    constructor(address initialHolder) ERC20("Budget Token", "BUD") {
        _mint(initialHolder, 20_000 ether);
    }
}
