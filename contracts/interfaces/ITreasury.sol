// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Integration boundary for BUD disbursements.
/// @dev Authorization, validation and replay protection belong to the implementation.
interface ITreasury {
    /// @notice Emitted only when a BUD payment succeeds; amount uses 18-decimal base units.
    event BudgetDisbursed(bytes32 indexed requestId, address indexed recipient, uint256 amount);

    /// @notice Pay a request through the authorized Timelock.
    /// @param requestId Identifier generated before proposal creation; payable successfully once.
    /// @param recipient Recipient other than zero address or the Treasury itself.
    /// @param amount Positive BUD amount in base units.
    /// @dev Insufficient funds must revert without consuming requestId.
    function disburse(bytes32 requestId, address recipient, uint256 amount) external;
}
