// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITreasury {
    event BudgetDisbursed(
        bytes32 indexed requestId,
        address indexed recipient,
        uint256 amount
    );

    function disburse(
        bytes32 requestId,
        address recipient,
        uint256 amount
    ) external;
}