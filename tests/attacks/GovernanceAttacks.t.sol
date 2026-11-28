// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GovernanceOracleHandler, GovernanceOracleChecks} from "../invariant/GovernanceInvariant.t.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";

/// @notice Concurrent proposals at DIFFERENT snapshots race the same finite
/// budget, then retry a still-ready operation before another proposal tries its
/// request. Unlike isolated input rows, all token/role/payment history persists.
contract GovernanceAttacksTest is GovernanceOracleChecks {
    GovernanceOracleHandler internal handler;

    function setUp() public {
        vm.warp(10_000);
        handler = new GovernanceOracleHandler();
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
