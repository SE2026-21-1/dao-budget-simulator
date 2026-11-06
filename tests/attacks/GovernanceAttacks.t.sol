// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GovernanceOracleHandler, GovernanceOracleChecks} from "../invariant/GovernanceInvariant.t.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {Treasury} from "../../contracts/Treasury.sol";
import {ITreasury} from "../../contracts/interfaces/ITreasury.sol";
import {BudgetGovernor} from "../../contracts/BudgetGovernor.sol";

/// @notice Concurrent proposals at DIFFERENT snapshots race the same finite
/// budget, then retry a still-ready operation before another proposal tries its
/// request. Unlike isolated input rows, all token/role/payment history persists.
contract GovernanceAttacksTest is GovernanceOracleChecks {
    GovernanceOracleHandler internal handler;

    function setUp() public {
        vm.warp(10_000);
        handler = new GovernanceOracleHandler();
    }

    function testSnapshotUsesFinalCheckpointAtSAndRejectsRewritesAtSPlusOne() public {
        handler.advance(0);
        handler.propose(0, 1, 1, 1_000 ether);
        GovernanceOracleHandler.Proposal memory p = handler.proposal(1);
        handler.advance(p.snapshot - block.timestamp);
        assertEq(block.timestamp, p.snapshot);
        assertEq(uint256(handler.governor().state(p.id)), uint256(IGovernor.ProposalState.Pending));

        // Every operation below shares EXACTLY S. Checkpoints must coalesce to
        // the final state, not the first transfer or an intermediate delegation.
        handler.transferGov(0, 4, 100 ether);
        handler.transferGov(0, 4, 50 ether);
        handler.delegateGov(1, 2);
        handler.delegateGov(1, 4);
        handler.approveGov(2, 3, 80 ether);
        handler.transferFromGov(2, 3, 4, 30 ether);
        handler.transferFromGov(2, 3, 4, 50 ether);
        handler.delegateGov(4, 0);
        handler.delegateGov(4, 4);
        assertEq(block.timestamp, p.snapshot);
        assertEq(handler.allowances(2, 3), 0);
        address voter = handler.actor(4);
        BudgetGovernor governor = handler.governor();
        vm.expectRevert(
            abi.encodeWithSelector(
                IGovernor.GovernorUnexpectedProposalState.selector,
                p.id,
                IGovernor.ProposalState.Pending,
                bytes32(uint256(1) << uint8(IGovernor.ProposalState.Active))
            )
        );
        vm.prank(voter);
        governor.castVote(p.id, 1);

        handler.advance(1);
        assertEq(block.timestamp, p.snapshot + 1);
        // Changes at S+1 precede voting, so reading live power or a checkpoint
        // after S would give a different answer for EVERY voter.
        handler.transferGov(0, 2, 250 ether);
        handler.delegateGov(1, 1);
        handler.approveGov(4, 3, 230 ether);
        handler.transferFromGov(4, 3, 3, 230 ether);
        handler.delegateGov(2, 0);
        for (uint256 i; i < handler.ACTOR_COUNT(); ++i) {
            handler.vote(1, i, 1);
        }
        assertEq(block.timestamp, p.snapshot + 1);
        p = handler.proposal(1);
        uint256[5] memory expected = [uint256(250 ether), 0, 120 ether, 100 ether, 530 ether];
        uint256[5] memory live = [uint256(370 ether), 300 ether, 0, 330 ether, 0];
        for (uint256 i; i < handler.ACTOR_COUNT(); ++i) {
            assertEq(p.weights[i], expected[i], "final checkpoint at S");
            assertEq(handler.gov().getPastVotes(handler.actor(i), p.snapshot), expected[i]);
            assertEq(handler.gov().getVotes(handler.actor(i)), live[i]);
        }
        assertEq(p.tallies[1], 1_000 ether);
        _assertOracle();
    }

    function testFinalRolesRejectOtherwiseValidOperationsIncludingFormerDeployer() public {
        handler.advance(0);
        handler.propose(0, 1, 1, 1_000 ether);
        GovernanceOracleHandler.Proposal memory p = _queueWithVotes(1);
        address[2] memory callers = [handler.bootstrap(), handler.actor(4)];

        for (uint256 i; i < callers.length; ++i) {
            _assertPendingRoleDenials(p, callers[i]);
        }

        handler.advance(p.eta - block.timestamp);
        for (uint256 i; i < callers.length; ++i) {
            _assertReadyRoleDenials(p, callers[i]);
        }

        // The same funded Ready operation succeeds through the final path,
        // without granting any role or impersonating Governor/Timelock.
        handler.execute(1);
        assertTrue(handler.timelock().isOperationDone(p.operation));
        assertEq(handler.bud().balanceOf(handler.recipient(1)), 1_000 ether);
        _assertOracle();
    }

    function testExecutionFailsAtEtaMinusOneAndSucceedsExactlyAtEta() public {
        handler.advance(0);
        handler.propose(0, 1, 1, 1_000 ether);
        GovernanceOracleHandler.Proposal memory p = _queueWithVotes(1);
        handler.advance(p.eta - 1 - block.timestamp);
        assertEq(block.timestamp, p.eta - 1);
        assertFalse(handler.timelock().isOperationReady(p.operation));
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _action(p);
        BudgetGovernor governor = handler.governor();
        vm.expectRevert(
            abi.encodeWithSelector(
                TimelockController.TimelockUnexpectedOperationState.selector,
                p.operation,
                bytes32(uint256(1) << uint8(TimelockController.OperationState.Ready))
            )
        );
        governor.execute(targets, values, data, p.descriptionHash);
        _assertQueuedUnpaid(p, 9_999 ether);
        _assertOracle();

        handler.advance(1);
        assertEq(block.timestamp, p.eta);
        assertTrue(handler.timelock().isOperationReady(p.operation));
        handler.execute(1);
        assertEq(handler.proposal(1).executedAt, p.eta);
        assertTrue(handler.timelock().isOperationDone(p.operation));
        assertEq(handler.bud().balanceOf(handler.recipient(1)), 1_000 ether);
        _assertOracle();
    }

    function testCanceledProposalDoesNotConsumeRequestAndDistinctProposalCanPayIt() public {
        handler.advance(0);
        handler.propose(0, 1, 1, 1_000 ether);
        GovernanceOracleHandler.Proposal memory canceled = handler.proposal(1);
        handler.cancel(1, 0);
        assertTrue(handler.proposal(1).canceled);
        assertEq(uint256(handler.governor().state(canceled.id)), uint256(IGovernor.ProposalState.Canceled));
        assertFalse(handler.timelock().isOperation(canceled.operation));
        assertFalse(handler.treasury().paidRequests(handler.requestId(1)));
        assertEq(handler.bud().balanceOf(address(handler.treasury())), 9_999 ether);
        assertEq(handler.bud().balanceOf(handler.recipient(1)), 0);

        // Cancellation is terminal for this proposal ID, not for the Treasury
        // request. Identical action plus a NEW description is a new proposal.
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _action(canceled);
        address proposer = handler.actor(0);
        BudgetGovernor governor = handler.governor();
        vm.expectRevert(
            abi.encodeWithSelector(
                IGovernor.GovernorUnexpectedProposalState.selector,
                canceled.id,
                IGovernor.ProposalState.Canceled,
                bytes32(0)
            )
        );
        vm.prank(proposer);
        governor.propose(targets, values, data, "tv4-stateful-proposal-1");
        handler.propose(0, 1, 1, 1_000 ether);
        GovernanceOracleHandler.Proposal memory replacement = _queueWithVotes(2);
        assertTrue(replacement.id != canceled.id);
        assertTrue(replacement.operation != canceled.operation);
        assertEq(replacement.request, canceled.request);
        handler.advance(replacement.eta - block.timestamp);
        handler.execute(2);
        assertEq(handler.paymentsByRequest(1), 1);
        assertEq(handler.bud().balanceOf(handler.recipient(1)), 1_000 ether);
        assertTrue(handler.timelock().isOperationDone(replacement.operation));
        assertFalse(handler.timelock().isOperation(canceled.operation));
        assertEq(uint256(handler.governor().state(canceled.id)), uint256(IGovernor.ProposalState.Canceled));
        _assertOracle();
    }

    function testQueuedInsufficientFundsCannotCancelAndSameOperationRetries() public {
        handler.advance(0);
        handler.propose(0, 1, 1, 11_000 ether);
        GovernanceOracleHandler.Proposal memory p = _queueWithVotes(1);
        handler.advance(p.eta - block.timestamp);
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _action(p);
        BudgetGovernor governor = handler.governor();
        vm.expectRevert(abi.encodeWithSelector(Treasury.InsufficientBudget.selector, 9_999 ether, 11_000 ether));
        governor.execute(targets, values, data, p.descriptionHash);
        _assertQueuedUnpaid(p, 9_999 ether);
        assertTrue(handler.timelock().isOperationReady(p.operation));

        address proposer = handler.actor(p.proposerIndex);
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorUnableToCancel.selector, p.id, proposer));
        vm.prank(proposer);
        governor.cancel(targets, values, data, p.descriptionHash);
        _assertQueuedUnpaid(p, 9_999 ether);
        assertTrue(handler.timelock().isOperationReady(p.operation));
        _assertOracle();

        uint256 queueAttempts = handler.attempts(uint256(GovernanceOracleHandler.CallKind.Queue));
        uint256 voteAttempts = handler.attempts(uint256(GovernanceOracleHandler.CallKind.Vote));
        handler.fund(1_001 ether);
        handler.execute(1);
        GovernanceOracleHandler.Proposal memory executed = handler.proposal(1);
        assertEq(executed.operation, p.operation);
        assertEq(executed.eta, p.eta);
        assertEq(handler.governor().proposalEta(p.id), p.eta);
        assertEq(handler.timelock().getTimestamp(p.operation), 1);
        assertEq(handler.paymentsByRequest(1), 1);
        assertEq(handler.bud().balanceOf(handler.recipient(1)), 11_000 ether);
        assertEq(handler.bud().balanceOf(address(handler.treasury())), 0);
        assertEq(handler.attempts(uint256(GovernanceOracleHandler.CallKind.Queue)), queueAttempts);
        assertEq(handler.attempts(uint256(GovernanceOracleHandler.CallKind.Vote)), voteAttempts);
        _assertOracle();
    }

    function _assertPendingRoleDenials(GovernanceOracleHandler.Proposal memory p, address caller) internal {
        TimelockController timelock = handler.timelock();
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _action(p);
        uint256 delay = timelock.getMinDelay();
        bytes32 freshSalt = keccak256(abi.encode("fresh unauthorized schedule", caller));
        bytes32 freshOperation = timelock.hashOperationBatch(targets, values, data, bytes32(0), freshSalt);
        assertFalse(timelock.isOperation(freshOperation));
        _expectAccessDenied(caller, timelock.PROPOSER_ROLE());
        timelock.scheduleBatch(targets, values, data, bytes32(0), freshSalt, delay);
        assertFalse(timelock.isOperation(freshOperation));
        _assertQueuedUnpaid(p, 9_999 ether);

        // A genuinely pending, cancellable operation: no nonexistent-ID
        // or Done-state failure may stand in for the missing role.
        assertTrue(timelock.isOperationPending(p.operation));
        assertFalse(timelock.isOperationReady(p.operation));
        _expectAccessDenied(caller, timelock.CANCELLER_ROLE());
        timelock.cancel(p.operation);
        _assertQueuedUnpaid(p, 9_999 ether);
    }

    function _assertReadyRoleDenials(GovernanceOracleHandler.Proposal memory p, address caller) internal {
        TimelockController timelock = handler.timelock();
        Treasury treasury = handler.treasury();
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _action(p);
        bytes32 salt = bytes32(bytes20(address(handler.governor()))) ^ p.descriptionHash;
        assertTrue(timelock.isOperationReady(p.operation));
        _expectAccessDenied(caller, timelock.EXECUTOR_ROLE());
        timelock.executeBatch(targets, values, data, bytes32(0), salt);
        _assertQueuedUnpaid(p, 9_999 ether);

        // Valid recipient, positive amount, unpaid request and enough BUD.
        bytes32 freshRequest = handler.requestId(2);
        address freshRecipient = handler.recipient(2);
        assertFalse(treasury.paidRequests(freshRequest));
        _expectAccessDenied(caller, treasury.SPENDER_ROLE());
        treasury.disburse(freshRequest, freshRecipient, 1 ether);
        assertFalse(treasury.paidRequests(freshRequest));
        assertEq(handler.bud().balanceOf(freshRecipient), 0);
        _assertQueuedUnpaid(p, 9_999 ether);
    }

    function _queueWithVotes(uint256 index) internal returns (GovernanceOracleHandler.Proposal memory p) {
        p = handler.proposal(index);
        handler.advance(p.snapshot + 1 - block.timestamp);
        handler.vote(index, 0, 1);
        handler.vote(index, 1, 1);
        handler.advance(p.deadline + 1 - block.timestamp);
        handler.queue(index);
        p = handler.proposal(index);
        assertEq(p.eta, block.timestamp + 120);
        assertEq(uint256(handler.governor().state(p.id)), uint256(IGovernor.ProposalState.Queued));
    }

    function _action(GovernanceOracleHandler.Proposal memory p)
        internal
        view
        returns (address[] memory targets, uint256[] memory values, bytes[] memory data)
    {
        targets = new address[](1);
        targets[0] = address(handler.treasury());
        values = new uint256[](1);
        data = new bytes[](1);
        data[0] = abi.encodeCall(
            ITreasury.disburse, (handler.requestId(p.request), handler.recipient(p.recipientIndex), p.amount)
        );
    }

    function _expectAccessDenied(address caller, bytes32 role) internal {
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, caller, role));
        vm.prank(caller);
    }

    function _assertQueuedUnpaid(GovernanceOracleHandler.Proposal memory p, uint256 budget) internal view {
        assertEq(uint256(handler.governor().state(p.id)), uint256(IGovernor.ProposalState.Queued));
        assertEq(handler.governor().proposalEta(p.id), p.eta);
        assertEq(handler.timelock().getTimestamp(p.operation), p.eta);
        assertFalse(handler.timelock().isOperationDone(p.operation));
        assertFalse(handler.treasury().paidRequests(handler.requestId(p.request)));
        assertEq(handler.paymentsByRequest(p.request), 0);
        assertEq(handler.bud().balanceOf(address(handler.treasury())), budget);
        assertEq(handler.bud().balanceOf(handler.recipient(p.recipientIndex)), 0);
    }

    function _assertOracle() internal view {
        _assertRequests(handler);
        _assertPathAndRoles(handler);
        _assertLedger(handler);
        _assertSnapshots(handler);
    }

    function testConcurrentSnapshotsBudgetRaceRetryAndSharedRequestStayIndependent() public {
        // Reachability control runs inside an action, not in fixture deployment.
        // Request 0 pays 1 BUD; 9,999 BUD remains and no bootstrap role remains.
        handler.advance(0);
        assertEq(handler.successfulExecutions(), 1);
        assertEq(handler.bud().balanceOf(address(handler.treasury())), 9_999 ether);

        handler.propose(0, 1, 0, 7_000 ether);
        GovernanceOracleHandler.Proposal memory first = handler.proposal(1);
        handler.advance(first.snapshot + 1 - block.timestamp);

        // A's 400 tokens and B's 300 delegated votes now belong to actor 4.
        // This must affect later snapshots, but cannot rewrite the first one.
        handler.transferGov(0, 4, 400 ether);
        handler.delegateGov(1, 4);
        handler.advance(1);
        handler.propose(4, 2, 1, 6_000 ether);
        handler.propose(4, 2, 2, 2_000 ether);
        GovernanceOracleHandler.Proposal memory second = handler.proposal(2);
        GovernanceOracleHandler.Proposal memory competing = handler.proposal(3);
        assertGt(second.snapshot, first.snapshot);
        assertTrue(first.id != second.id && second.id != competing.id);
        assertTrue(second.operation != competing.operation);
        assertEq(second.request, competing.request);

        handler.advance(second.snapshot + 1 - block.timestamp);
        // After both later snapshots, remove all of actor 4's current power.
        // Its historical 700 votes must nevertheless remain valid in BOTH.
        handler.delegateGov(4, handler.ACTOR_COUNT());
        handler.delegateGov(1, 1);
        handler.approveGov(4, 3, 400 ether);
        handler.transferFromGov(4, 3, 2, 400 ether);
        assertEq(handler.allowances(4, 3), 0);
        // A different funded owner gave this spender no approval: the denied
        // transfer cannot rewrite either proposal's already pinned snapshot.
        uint256 delegatedFailures = handler.reverts(uint256(GovernanceOracleHandler.CallKind.TransferFrom));
        handler.transferFromGov(2, 3, 4, 1 ether);
        assertEq(handler.reverts(uint256(GovernanceOracleHandler.CallKind.TransferFrom)), delegatedFailures + 1);
        handler.vote(1, 0, 1);
        handler.vote(1, 1, 1);
        handler.vote(2, 4, 1);
        handler.vote(3, 4, 1);
        // A's vote cannot be reused after tokens were moved to the later voter.
        handler.vote(1, 4, 1); // Zero weight at the first snapshot.
        handler.vote(2, 0, 1); // Zero weight at the second snapshot.
        handler.vote(2, 4, 0); // Duplicate rejected, original For remains.

        first = handler.proposal(1);
        second = handler.proposal(2);
        assertEq(first.weights[0], 400 ether);
        assertEq(first.weights[1], 300 ether);
        assertEq(first.weights[4], 0);
        assertEq(second.weights[0], 0);
        assertEq(second.weights[1], 0);
        assertEq(second.weights[4], 700 ether);
        assertEq(handler.gov().getVotes(handler.actor(4)), 0);
        assertEq(first.tallies[1], 700 ether);
        assertEq(second.tallies[1], 700 ether);
        _assertSnapshots(handler);

        handler.advance(second.deadline + 1 - block.timestamp);
        handler.queue(1);
        handler.queue(2);
        handler.queue(3);
        second = handler.proposal(2);
        uint256 originalEta = second.eta;
        bytes32 originalOperation = second.operation;
        handler.advance(120);

        // Adversaries include the FORMER bootstrap; even a Ready operation may
        // only execute through Governor, whose executor role is not open.
        handler.unauthorized(2, 0, 2);
        handler.unauthorized(5, 0, 2);
        handler.unauthorized(8, 0, 2);
        handler.execute(1);
        assertEq(handler.bud().balanceOf(address(handler.treasury())), 2_999 ether);
        uint256 failuresBefore = handler.reverts(uint256(GovernanceOracleHandler.CallKind.Execute));
        handler.execute(2); // Oversubscription is discovered only at execution.
        assertEq(handler.reverts(uint256(GovernanceOracleHandler.CallKind.Execute)), failuresBefore + 1);
        assertEq(handler.paymentsByRequest(2), 0);
        assertFalse(handler.treasury().paidRequests(handler.requestId(2)));
        assertEq(uint256(handler.governor().state(second.id)), uint256(IGovernor.ProposalState.Queued));
        assertTrue(handler.timelock().isOperationReady(originalOperation));
        assertFalse(handler.timelock().isOperationDone(originalOperation));
        assertEq(handler.governor().proposalEta(second.id), originalEta);
        assertEq(handler.bud().balanceOf(handler.recipient(1)), 0);
        _assertLedger(handler);

        // Neither votes nor queue are repeated: the SAME operation retries.
        handler.fund(3_001 ether);
        handler.execute(2);
        assertEq(handler.timelock().getTimestamp(originalOperation), 1);
        assertEq(handler.governor().proposalEta(second.id), originalEta);
        assertEq(handler.paymentsByRequest(2), 1);
        assertEq(handler.bud().balanceOf(handler.recipient(1)), 6_000 ether);
        assertEq(handler.bud().balanceOf(address(handler.treasury())), 0);

        // Refill enough for the competing request so its rejection cannot be
        // explained by insufficient budget. Neither the distinct proposal nor
        // a replay of the successful operation may pay this request again.
        handler.fund(2_000 ether);
        handler.execute(3);
        handler.execute(2);
        assertEq(handler.paymentsByRequest(2), 1);
        assertEq(handler.bud().balanceOf(handler.recipient(2)), 0);
        assertEq(handler.bud().balanceOf(address(handler.treasury())), 2_000 ether);
        assertEq(uint256(handler.governor().state(competing.id)), uint256(IGovernor.ProposalState.Queued));
        assertTrue(handler.timelock().isOperationReady(competing.operation));
        assertEq(handler.successfulExecutions(), 3);
        assertEq(handler.spontaneousExecutions(), 2);
        assertEq(handler.totalFunded(), 15_001 ether);
        assertEq(handler.totalPaid(), 13_001 ether);
        _assertRequests(handler);
        _assertPathAndRoles(handler);
        _assertLedger(handler);
        _assertSnapshots(handler);
    }
}
