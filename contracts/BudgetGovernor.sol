// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {GovernorSettings} from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {GovernorVotes} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {
    GovernorVotesQuorumFraction
} from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import {GovernorTimelockControl} from "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {IERC6372} from "@openzeppelin/contracts/interfaces/IERC6372.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";

/// @notice Governance restricted to exactly one canonical BUD disbursement per proposal.
contract BudgetGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    ITreasury public immutable treasury;

    error InvalidContract(address account);
    error InvalidTokenClock();
    error InvalidActionCount(uint256 targets, uint256 values, uint256 calldatas);
    error InvalidTarget(address target);
    error InvalidNativeValue(uint256 value);
    error InvalidCalldata();
    error InvalidRecipient(address recipient);
    error InvalidAmount(uint256 amount);

    /// @param gov Deployed SC02 GOV with ERC-6372 timestamp clock.
    /// @param treasuryAddress Deployed SC03 Treasury; never changed by this Governor.
    /// @param timelockAddress Deployed OpenZeppelin Timelock; production roles are configured in SC05.
    constructor(address gov, address treasuryAddress, address timelockAddress)
        Governor("BudgetGovernor")
        GovernorSettings(60, 300, 50 ether)
        GovernorVotes(IVotes(_validatedGov(gov)))
        GovernorVotesQuorumFraction(20)
        GovernorTimelockControl(TimelockController(payable(timelockAddress)))
    {
        if (treasuryAddress.code.length == 0) revert InvalidContract(treasuryAddress);
        if (timelockAddress.code.length == 0) revert InvalidContract(timelockAddress);
        treasury = ITreasury(treasuryAddress);
    }

    /// @dev Validate before module constructors use the token clock/checkpoints.
    function _validatedGov(address gov) private view returns (address) {
        if (gov.code.length == 0) revert InvalidContract(gov);
        if (
            keccak256(bytes(IERC6372(gov).CLOCK_MODE())) != keccak256("mode=timestamp")
                || IERC6372(gov).clock() != block.timestamp
        ) revert InvalidTokenClock();
        return gov;
    }

    /// @dev All proposal creation in this module combination passes through this hook.
    function _propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        address proposer
    ) internal override returns (uint256) {
        if (targets.length != 1 || values.length != 1 || calldatas.length != 1) {
            revert InvalidActionCount(targets.length, values.length, calldatas.length);
        }
        if (targets[0] != address(treasury)) revert InvalidTarget(targets[0]);
        if (values[0] != 0) revert InvalidNativeValue(values[0]);
        bytes memory payload = calldatas[0];
        if (payload.length != 100 || bytes4(payload) != ITreasury.disburse.selector) revert InvalidCalldata();
        // Copy the three ABI words after the selector, then use the strict ABI decoder.
        bytes memory arguments = new bytes(96);
        for (uint256 i = 0; i < 96; ++i) {
            arguments[i] = payload[i + 4];
        }
        (, address recipient, uint256 amount) = abi.decode(arguments, (bytes32, address, uint256));
        if (recipient == address(0) || recipient == address(treasury)) revert InvalidRecipient(recipient);
        if (amount == 0) revert InvalidAmount(amount);
        return super._propose(targets, values, calldatas, description, proposer);
    }

    function votingDelay() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    function quorum(uint256 timepoint) public view override(Governor, GovernorVotesQuorumFraction) returns (uint256) {
        return super.quorum(timepoint);
    }

    function state(uint256 proposalId) public view override(Governor, GovernorTimelockControl) returns (ProposalState) {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor() internal view override(Governor, GovernorTimelockControl) returns (address) {
        return super._executor();
    }
}
