// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";

/// @notice Holds a single configured BUD token and pays each request at most once.
contract Treasury is ITreasury, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant SPENDER_ROLE = keccak256("SPENDER_ROLE");
    IERC20 public immutable budgetToken;
    mapping(bytes32 requestId => bool paid) public paidRequests;

    error InvalidBudgetToken(address token);
    error InvalidAdmin(address admin);
    error InvalidRecipient(address recipient);
    error InvalidAmount(uint256 amount);
    error RequestAlreadyPaid(bytes32 requestId);
    error InsufficientBudget(uint256 available, uint256 required);

    /// @param token Deployed BUD contract; immutable for this Treasury.
    /// @param initialAdmin Bootstrap administrator, without automatic spending authority.
    constructor(address token, address initialAdmin) {
        if (token.code.length == 0) revert InvalidBudgetToken(token);
        if (initialAdmin == address(0)) revert InvalidAdmin(initialAdmin);
        budgetToken = IERC20(token);
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
    }

    /// @inheritdoc ITreasury
    function disburse(bytes32 requestId, address recipient, uint256 amount) external override onlyRole(SPENDER_ROLE) {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient(recipient);
        if (amount == 0) revert InvalidAmount(amount);
        if (paidRequests[requestId]) revert RequestAlreadyPaid(requestId);
        uint256 available = budgetToken.balanceOf(address(this));
        if (available < amount) revert InsufficientBudget(available, amount);

        paidRequests[requestId] = true;
        budgetToken.safeTransfer(recipient, amount);
        emit BudgetDisbursed(requestId, recipient, amount);
    }
}
