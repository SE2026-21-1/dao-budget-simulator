// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BudgetGovernor} from "../../contracts/BudgetGovernor.sol";
import {GovernanceToken} from "../../contracts/GovernanceToken.sol";
import {BudgetToken} from "../../contracts/BudgetToken.sol";
import {Treasury} from "../../contracts/Treasury.sol";
import {ITreasury} from "../../contracts/interfaces/ITreasury.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract WrongClockToken {
    function clock() external view returns (uint48) {
        return uint48(block.number);
    }

    function CLOCK_MODE() external pure returns (string memory) {
        return "mode=blocknumber&from=default";
    }
}

contract BudgetGovernorTest is Test {
    GovernanceToken internal gov;
    BudgetToken internal bud;
    Treasury internal treasury;
    TimelockController internal timelock;
    BudgetGovernor internal governor;
    address internal a = makeAddr("A");
    address internal b = makeAddr("B");
    address internal c = makeAddr("C");
    address internal d = makeAddr("D");
    address internal outsider = makeAddr("outsider");
    address internal recipient = makeAddr("recipient");
    bytes32 internal constant REQUEST = keccak256("budget-request");
    string internal constant DESCRIPTION =
        '{"version":1,"title":"Demo chi ngan sach","body":"De xuat chi 1000 BUD cho hoat dong DAO."}';
    address[] internal targets;
    uint256[] internal values;
    bytes[] internal calldatas;

    function setUp() public {
        vm.warp(1_000);
        gov = new GovernanceToken(a, b, c, d);
        bud = new BudgetToken(address(this));
        treasury = new Treasury(address(bud), address(this));
        timelock = new TimelockController(120, new address[](0), new address[](0), address(this));
        governor = new BudgetGovernor(address(gov), address(treasury), address(timelock));
        // Unit fixture only: not a production deployment or SC05 role acceptance.
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
        treasury.grantRole(treasury.SPENDER_ROLE(), address(timelock));
        bud.transfer(address(treasury), 10_000 ether);
        vm.prank(a);
        gov.delegate(a);
        vm.prank(b);
        gov.delegate(b);
        vm.prank(c);
        gov.delegate(c);
        vm.prank(d);
        gov.delegate(d);
        vm.warp(1_001);
        targets.push(address(treasury));
        values.push(0);
        calldatas.push(abi.encodeCall(ITreasury.disburse, (REQUEST, recipient, 1_000 ether)));
    }

    function _create() internal returns (uint256) {
        vm.prank(a);
        return governor.propose(targets, values, calldatas, DESCRIPTION);
    }

    function _active(uint256 id) internal {
        vm.warp(governor.proposalSnapshot(id) + 1);
    }

    function _finish(uint256 id) internal {
        vm.warp(governor.proposalDeadline(id) + 1);
    }

    function _vote(address voter, uint256 id, uint8 support) internal returns (uint256) {
        vm.prank(voter);
        return governor.castVote(id, support);
    }

    function _state(uint256 id, IGovernor.ProposalState expected) internal view {
        assertEq(uint256(governor.state(id)), uint256(expected));
    }

    function _successful() internal returns (uint256 id) {
        id = _create();
        _active(id);
        _vote(a, id, 1);
        _finish(id);
        _state(id, IGovernor.ProposalState.Succeeded);
    }

    function _expectState(uint256 id, IGovernor.ProposalState current, IGovernor.ProposalState required) internal {
        vm.expectRevert(
            abi.encodeWithSelector(
                IGovernor.GovernorUnexpectedProposalState.selector, id, current, bytes32(uint256(1) << uint8(required))
            )
        );
    }

    function _rejectPayload(bytes memory data, bytes memory expectedError) internal {
        calldatas[0] = data;
        vm.expectRevert(expectedError);
        vm.prank(a);
        governor.propose(targets, values, calldatas, DESCRIPTION);
    }

    function testConstructorAndConfiguration() public view {
        assertEq(governor.name(), "BudgetGovernor");
        assertEq(address(governor.token()), address(gov));
        assertEq(address(governor.treasury()), address(treasury));
        assertEq(governor.timelock(), address(timelock));
        assertEq(governor.proposalThreshold(), 50 ether);
        assertEq(governor.votingDelay(), 60);
        assertEq(governor.votingPeriod(), 300);
        assertEq(governor.quorumNumerator(), 20);
        assertEq(governor.quorumDenominator(), 100);
        assertEq(governor.quorum(1_000), 200 ether);
        assertEq(governor.clock(), block.timestamp);
        assertEq(governor.CLOCK_MODE(), "mode=timestamp");
        assertEq(governor.COUNTING_MODE(), "support=bravo&quorum=for,abstain");
        assertTrue(governor.proposalNeedsQueuing(0));
    }

    function testFuzzConstructorRejectsZeroOrEOA(uint8 field, bool zero) public {
        address[3] memory args = [address(gov), address(treasury), address(timelock)];
        address invalid = zero ? address(0) : outsider;
        args[bound(field, 0, 2)] = invalid;
        vm.expectRevert(abi.encodeWithSelector(BudgetGovernor.InvalidContract.selector, invalid));
        new BudgetGovernor(args[0], args[1], args[2]);
    }

    function testConstructorRejectsBlockNumberClock() public {
        WrongClockToken wrong = new WrongClockToken();
        vm.expectRevert(BudgetGovernor.InvalidTokenClock.selector);
        new BudgetGovernor(address(wrong), address(treasury), address(timelock));
    }

    function testBelowThresholdCannotPropose() public {
        vm.prank(a);
        gov.transfer(outsider, 49 ether);
        vm.prank(outsider);
        gov.delegate(outsider);
        vm.warp(block.timestamp + 1);
        vm.expectRevert(
            abi.encodeWithSelector(IGovernor.GovernorInsufficientProposerVotes.selector, outsider, 49 ether, 50 ether)
        );
        vm.prank(outsider);
        governor.propose(targets, values, calldatas, DESCRIPTION);
    }

    function testExactlyThresholdCanPropose() public {
        vm.prank(a);
        gov.transfer(outsider, 50 ether);
        vm.prank(outsider);
        gov.delegate(outsider);
        vm.warp(block.timestamp + 1);
        vm.prank(outsider);
        uint256 id = governor.propose(targets, values, calldatas, DESCRIPTION);
        assertEq(governor.proposalProposer(id), outsider);
        _state(id, IGovernor.ProposalState.Pending);
    }

    function testBalanceWithoutDelegationCannotPropose() public {
        vm.prank(a);
        gov.transfer(outsider, 100 ether);
        vm.warp(block.timestamp + 1);
        assertEq(gov.balanceOf(outsider), 100 ether);
        assertEq(gov.getVotes(outsider), 0);
        vm.expectRevert(
            abi.encodeWithSelector(IGovernor.GovernorInsufficientProposerVotes.selector, outsider, 0, 50 ether)
        );
        vm.prank(outsider);
        governor.propose(targets, values, calldatas, DESCRIPTION);
    }

    function testDelegationMustBePastForThreshold() public {
        vm.prank(a);
        gov.transfer(outsider, 50 ether);
        vm.prank(outsider);
        gov.delegate(outsider);
        vm.expectRevert(
            abi.encodeWithSelector(IGovernor.GovernorInsufficientProposerVotes.selector, outsider, 0, 50 ether)
        );
        vm.prank(outsider);
        governor.propose(targets, values, calldatas, DESCRIPTION);
    }

    function testValidProposalAndHash() public {
        uint256 id = _create();
        bytes32 hash = keccak256(bytes(DESCRIPTION));
        assertEq(id, uint256(keccak256(abi.encode(targets, values, calldatas, hash))));
        assertEq(id, governor.hashProposal(targets, values, calldatas, hash));
        assertEq(governor.proposalProposer(id), a);
        assertEq(governor.proposalSnapshot(id), 1_061);
        assertEq(governor.proposalDeadline(id), 1_361);
        assertEq(bud.balanceOf(address(treasury)), 10_000 ether);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testDescriptionBytesAreNotReserialized() public view {
        bytes32 original = keccak256(bytes(DESCRIPTION));
        bytes32 spaced = keccak256(bytes(string.concat(" ", DESCRIPTION)));
        assertTrue(original != spaced);
        assertTrue(
            governor.hashProposal(targets, values, calldatas, original)
                != governor.hashProposal(targets, values, calldatas, spaced)
        );
    }

    function testSC01FixtureHash() public view {
        address[] memory ts = new address[](1);
        ts[0] = 0x1111111111111111111111111111111111111111;
        uint256[] memory vs = new uint256[](1);
        bytes[] memory cs = new bytes[](1);
        cs[0] = abi.encodeCall(
            ITreasury.disburse,
            (
                bytes32(uint256(type(uint256).max / 255)),
                address(0x2222222222222222222222222222222222222222),
                1_000 ether
            )
        );
        assertEq(
            governor.hashProposal(ts, vs, cs, keccak256(bytes(DESCRIPTION))),
            41188251149770464419086128880638239388642337502157923625475508004855043094545
        );
    }

    function testWrongTargetRejectedOnDirectPropose() public {
        targets[0] = address(bud);
        vm.expectRevert(abi.encodeWithSelector(BudgetGovernor.InvalidTarget.selector, address(bud)));
        vm.prank(a);
        governor.propose(targets, values, calldatas, DESCRIPTION);
    }

    function testNativeValueRejected() public {
        values[0] = 1;
        vm.expectRevert(abi.encodeWithSelector(BudgetGovernor.InvalidNativeValue.selector, uint256(1)));
        vm.prank(a);
        governor.propose(targets, values, calldatas, DESCRIPTION);
    }

    function testGrantRoleSelectorRejected() public {
        _rejectPayload(
            abi.encodeWithSignature("grantRole(bytes32,address)", bytes32(0), outsider),
            abi.encodeWithSelector(BudgetGovernor.InvalidCalldata.selector)
        );
    }

    function testRevokeRoleSelectorRejected() public {
        _rejectPayload(
            abi.encodeWithSignature("revokeRole(bytes32,address)", bytes32(0), outsider),
            abi.encodeWithSelector(BudgetGovernor.InvalidCalldata.selector)
        );
    }

    function testTokenTransferSelectorRejected() public {
        _rejectPayload(
            abi.encodeCall(bud.transfer, (outsider, 1 ether)),
            abi.encodeWithSelector(BudgetGovernor.InvalidCalldata.selector)
        );
    }

    function testWrongSelectorWithCorrectLengthRejected() public {
        _rejectPayload(
            abi.encodeWithSelector(bytes4(0xdeadbeef), REQUEST, recipient, 1 ether),
            abi.encodeWithSelector(BudgetGovernor.InvalidCalldata.selector)
        );
    }

    function testMultipleActionsRejected() public {
        targets.push(address(treasury));
        values.push(0);
        calldatas.push(calldatas[0]);
        vm.expectRevert(abi.encodeWithSelector(BudgetGovernor.InvalidActionCount.selector, 2, 2, 2));
        vm.prank(a);
        governor.propose(targets, values, calldatas, DESCRIPTION);
    }

    function testFuzzMismatchedArrayLengthsRejected(uint8 field, uint8 length) public {
        uint256 n = bound(length, 0, 3);
        if (n == 1) n = 0;
        address[] memory ts = targets;
        uint256[] memory vs = values;
        bytes[] memory cs = calldatas;
        uint256 f = bound(field, 0, 2);
        if (f == 0) ts = new address[](n);
        if (f == 1) vs = new uint256[](n);
        if (f == 2) cs = new bytes[](n);
        vm.expectRevert(
            abi.encodeWithSelector(BudgetGovernor.InvalidActionCount.selector, ts.length, vs.length, cs.length)
        );
        vm.prank(a);
        governor.propose(ts, vs, cs, DESCRIPTION);
    }

    function testZeroRecipientRejected() public {
        _rejectPayload(
            abi.encodeCall(ITreasury.disburse, (REQUEST, address(0), 1 ether)),
            abi.encodeWithSelector(BudgetGovernor.InvalidRecipient.selector, address(0))
        );
    }

    function testTreasuryRecipientRejected() public {
        _rejectPayload(
            abi.encodeCall(ITreasury.disburse, (REQUEST, address(treasury), 1 ether)),
            abi.encodeWithSelector(BudgetGovernor.InvalidRecipient.selector, address(treasury))
        );
    }

    function testZeroAmountRejected() public {
        _rejectPayload(
            abi.encodeCall(ITreasury.disburse, (REQUEST, recipient, 0)),
            abi.encodeWithSelector(BudgetGovernor.InvalidAmount.selector, uint256(0))
        );
    }

    function testFuzzMalformedCalldataLengthRejected(uint8 length) public {
        uint256 n = bound(length, 0, 150);
        if (n == 100) n = 99;
        bytes memory data = new bytes(n);
        _rejectPayload(data, abi.encodeWithSelector(BudgetGovernor.InvalidCalldata.selector));
    }

    function testTrailingDataRejected() public {
        _rejectPayload(
            bytes.concat(calldatas[0], hex"00"), abi.encodeWithSelector(BudgetGovernor.InvalidCalldata.selector)
        );
    }

    function testDirtyAddressPaddingRejected() public {
        bytes memory data = calldatas[0];
        data[36] = 0x01;
        calldatas[0] = data;
        vm.expectRevert(); // Strict ABI decoder rejects non-zero high bits of address word.
        vm.prank(a);
        governor.propose(targets, values, calldatas, DESCRIPTION);
    }

    function testZeroRequestAccepted() public {
        calldatas[0] = abi.encodeCall(ITreasury.disburse, (bytes32(0), recipient, 1 ether));
        _state(_create(), IGovernor.ProposalState.Pending);
    }

    function testGovernorSettingsProposalRejected() public {
        targets[0] = address(governor);
        calldatas[0] = abi.encodeCall(governor.setVotingDelay, (uint48(1)));
        vm.expectRevert(abi.encodeWithSelector(BudgetGovernor.InvalidTarget.selector, address(governor)));
        vm.prank(a);
        governor.propose(targets, values, calldatas, DESCRIPTION);
    }

    function testTimelockTargetRejected() public {
        targets[0] = address(timelock);
        vm.expectRevert(abi.encodeWithSelector(BudgetGovernor.InvalidTarget.selector, address(timelock)));
        vm.prank(a);
        governor.propose(targets, values, calldatas, DESCRIPTION);
    }

    function testInsufficientQuorumDefeated() public {
        uint256 id = _create();
        _active(id);
        _vote(d, id, 1);
        _finish(id);
        _state(id, IGovernor.ProposalState.Defeated);
        _expectState(id, IGovernor.ProposalState.Defeated, IGovernor.ProposalState.Succeeded);
        governor.queue(targets, values, calldatas, keccak256(bytes(DESCRIPTION)));
    }

    function testForPlusAbstainReachesQuorum() public {
        vm.prank(c);
        gov.transfer(outsider, 100 ether);
        vm.prank(outsider);
        gov.delegate(outsider);
        vm.warp(block.timestamp + 1);
        uint256 id = _create();
        _active(id);
        _vote(d, id, 1);
        _vote(outsider, id, 2);
        _finish(id);
        _state(id, IGovernor.ProposalState.Succeeded);
        (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes) = governor.proposalVotes(id);
        assertEq(againstVotes, 0);
        assertEq(forVotes, 100 ether);
        assertEq(abstainVotes, 100 ether);
    }

    function testTieDefeated() public {
        vm.prank(a);
        gov.transfer(outsider, 200 ether);
        vm.warp(block.timestamp + 1);
        uint256 id = _create();
        _active(id);
        _vote(a, id, 1);
        _vote(c, id, 0);
        _finish(id);
        _state(id, IGovernor.ProposalState.Defeated);
    }

    function testLossDespiteQuorumDefeated() public {
        vm.prank(a);
        gov.transfer(outsider, 100 ether);
        vm.prank(outsider);
        gov.delegate(outsider);
        vm.warp(block.timestamp + 1);
        uint256 id = _create();
        _active(id);
        _vote(d, id, 1);
        _vote(c, id, 0);
        _vote(outsider, id, 2);
        _finish(id);
        _state(id, IGovernor.ProposalState.Defeated);
    }

    function testFor400Against300SucceedsWithoutAutomaticPayment() public {
        uint256 id = _create();
        _active(id);
        _vote(a, id, 1);
        _vote(b, id, 0);
        _finish(id);
        _state(id, IGovernor.ProposalState.Succeeded);
        assertEq(bud.balanceOf(address(treasury)), 10_000 ether);
        assertEq(bud.balanceOf(recipient), 0);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testAbstainAloneCannotWin() public {
        uint256 id = _create();
        _active(id);
        _vote(a, id, 2);
        _finish(id);
        _state(id, IGovernor.ProposalState.Defeated);
    }

    function testDuplicateVoteRejectedAcrossEntryPoints() public {
        uint256 id = _create();
        _active(id);
        _vote(a, id, 1);
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorAlreadyCastVote.selector, a));
        vm.prank(a);
        governor.castVoteWithReason(id, 0, "change vote");
        (, uint256 forVotes,) = governor.proposalVotes(id);
        assertEq(forVotes, 400 ether);
    }

    function testInvalidVoteTypeRejected() public {
        uint256 id = _create();
        _active(id);
        vm.expectRevert(IGovernor.GovernorInvalidVoteType.selector);
        _vote(a, id, 3);
        assertFalse(governor.hasVoted(id, a));
    }

    function testZeroVotingPowerWeightIsZero() public {
        vm.prank(a);
        gov.transfer(outsider, 50 ether);
        uint256 id = _create();
        _active(id);
        assertEq(_vote(outsider, id, 1), 0);
        assertTrue(governor.hasVoted(id, outsider));
        (, uint256 votes,) = governor.proposalVotes(id);
        assertEq(votes, 0);
    }

    function testVotingWindowBoundaries() public {
        uint256 id = _create();
        uint256 snapshot = governor.proposalSnapshot(id);
        vm.warp(snapshot - 1);
        _state(id, IGovernor.ProposalState.Pending);
        _expectState(id, IGovernor.ProposalState.Pending, IGovernor.ProposalState.Active);
        _vote(a, id, 1);
        vm.warp(snapshot);
        _state(id, IGovernor.ProposalState.Pending);
        _expectState(id, IGovernor.ProposalState.Pending, IGovernor.ProposalState.Active);
        _vote(a, id, 1);
        vm.warp(snapshot + 1);
        _state(id, IGovernor.ProposalState.Active);
        assertEq(_vote(a, id, 1), 400 ether);
        vm.warp(governor.proposalDeadline(id));
        _state(id, IGovernor.ProposalState.Active);
        _vote(b, id, 0);
        vm.warp(governor.proposalDeadline(id) + 1);
        _state(id, IGovernor.ProposalState.Succeeded);
        _expectState(id, IGovernor.ProposalState.Succeeded, IGovernor.ProposalState.Active);
        _vote(c, id, 1);
    }

    function testBalanceTransferAfterSnapshotDoesNotChangeVoteWeight() public {
        uint256 id = _create();
        _active(id);
        vm.prank(a);
        gov.transfer(b, 400 ether);
        assertEq(gov.getVotes(a), 0);
        assertEq(gov.getVotes(b), 700 ether);
        assertEq(_vote(a, id, 1), 400 ether);
        assertEq(_vote(b, id, 0), 300 ether);
    }

    function testDelegateChangeAfterSnapshotDoesNotChangeVoteWeight() public {
        uint256 id = _create();
        _active(id);
        vm.prank(a);
        gov.delegate(b);
        assertEq(gov.getVotes(a), 0);
        assertEq(gov.getVotes(b), 700 ether);
        assertEq(_vote(a, id, 1), 400 ether);
        assertEq(_vote(b, id, 0), 300 ether);
    }

    function testDelegateAfterSnapshotDoesNotCreateVotes() public {
        vm.prank(a);
        gov.transfer(outsider, 100 ether);
        uint256 id = _create();
        _active(id);
        vm.prank(outsider);
        gov.delegate(outsider);
        assertEq(gov.getVotes(outsider), 100 ether);
        assertEq(_vote(outsider, id, 1), 0);
    }

    function testDelegatingToAnotherWalletMovesVotesNotTokens() public {
        vm.prank(a);
        gov.delegate(outsider);
        vm.warp(block.timestamp + 1);
        assertEq(gov.balanceOf(a), 400 ether);
        assertEq(gov.balanceOf(outsider), 0);
        vm.prank(outsider);
        uint256 id = governor.propose(targets, values, calldatas, DESCRIPTION);
        _active(id);
        assertEq(_vote(outsider, id, 1), 400 ether);
        assertEq(_vote(a, id, 1), 0);
    }

    function testCreatorCancelsPendingAndBlocksAllActions() public {
        uint256 id = _create();
        vm.prank(a);
        assertEq(governor.cancel(targets, values, calldatas, keccak256(bytes(DESCRIPTION))), id);
        _state(id, IGovernor.ProposalState.Canceled);
        _active(id);
        _expectState(id, IGovernor.ProposalState.Canceled, IGovernor.ProposalState.Active);
        _vote(a, id, 1);
        _expectState(id, IGovernor.ProposalState.Canceled, IGovernor.ProposalState.Succeeded);
        governor.queue(targets, values, calldatas, keccak256(bytes(DESCRIPTION)));
        vm.expectRevert();
        governor.execute(targets, values, calldatas, keccak256(bytes(DESCRIPTION)));
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testOtherWalletCannotCancelPending() public {
        uint256 id = _create();
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorUnableToCancel.selector, id, b));
        vm.prank(b);
        governor.cancel(targets, values, calldatas, keccak256(bytes(DESCRIPTION)));
        _state(id, IGovernor.ProposalState.Pending);
    }

    function _cannotCancel(uint256 id) internal {
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorUnableToCancel.selector, id, a));
        vm.prank(a);
        governor.cancel(targets, values, calldatas, keccak256(bytes(DESCRIPTION)));
    }

    function testCreatorCannotCancelActive() public {
        uint256 id = _create();
        _active(id);
        _cannotCancel(id);
    }

    function testCreatorCannotCancelSucceeded() public {
        uint256 id = _successful();
        _cannotCancel(id);
    }

    function testCreatorCannotCancelQueued() public {
        uint256 id = _successful();
        governor.queue(targets, values, calldatas, keccak256(bytes(DESCRIPTION)));
        _cannotCancel(id);
    }

    function testCreatorCannotCancelExecuted() public {
        uint256 id = _successful();
        governor.queue(targets, values, calldatas, keccak256(bytes(DESCRIPTION)));
        vm.warp(governor.proposalEta(id));
        governor.execute(targets, values, calldatas, keccak256(bytes(DESCRIPTION)));
        _state(id, IGovernor.ProposalState.Executed);
        _cannotCancel(id);
        assertEq(bud.balanceOf(recipient), 1_000 ether);
    }

    function testCreatorCannotCancelDefeated() public {
        uint256 id = _create();
        _finish(id);
        _state(id, IGovernor.ProposalState.Defeated);
        _cannotCancel(id);
    }

    function testExecuteWithoutQueueRejected() public {
        _successful();
        bytes32 descriptionHash = keccak256(bytes(DESCRIPTION));
        bytes32 salt = bytes32(bytes20(address(governor))) ^ descriptionHash;
        bytes32 operationId = timelock.hashOperationBatch(targets, values, calldatas, bytes32(0), salt);
        vm.expectRevert(
            abi.encodeWithSelector(
                TimelockController.TimelockUnexpectedOperationState.selector, operationId, bytes32(uint256(1) << 2)
            )
        );
        governor.execute(targets, values, calldatas, keccak256(bytes(DESCRIPTION)));
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testSettingsCannotBeChangedDirectlyByWallet() public {
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorOnlyExecutor.selector, address(this)));
        governor.setVotingDelay(1);
    }

    function testProposalCreatedPreservesRawIntegrationData() public {
        uint256 id = governor.hashProposal(targets, values, calldatas, keccak256(bytes(DESCRIPTION)));
        vm.expectEmit(false, false, false, true, address(governor));
        emit IGovernor.ProposalCreated(
            id, a, targets, values, new string[](1), calldatas, block.timestamp + 60, block.timestamp + 360, DESCRIPTION
        );
        assertEq(_create(), id);
    }

    function testCreatorCanCancelAtSnapshotWhileStillPending() public {
        uint256 id = _create();
        vm.warp(governor.proposalSnapshot(id));
        vm.prank(a);
        governor.cancel(targets, values, calldatas, keccak256(bytes(DESCRIPTION)));
        _state(id, IGovernor.ProposalState.Canceled);
    }

    function testProposalDoesNotReserveBudgetOrRequireUnusedRequest() public {
        calldatas[0] = abi.encodeCall(ITreasury.disburse, (REQUEST, recipient, 20_000 ether));
        uint256 first = _create();
        vm.prank(b);
        uint256 second = governor.propose(targets, values, calldatas, string.concat(DESCRIPTION, " "));
        assertTrue(first != second);
        _state(first, IGovernor.ProposalState.Pending);
        _state(second, IGovernor.ProposalState.Pending);
        assertEq(bud.balanceOf(address(treasury)), 10_000 ether);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testCannotQueueBeforeVotingCompletes() public {
        uint256 id = _create();
        _active(id);
        _vote(a, id, 1);
        _expectState(id, IGovernor.ProposalState.Active, IGovernor.ProposalState.Succeeded);
        governor.queue(targets, values, calldatas, keccak256(bytes(DESCRIPTION)));
    }

    function _descriptionHash() internal pure returns (bytes32) {
        return keccak256(bytes(DESCRIPTION));
    }

    function _operation(bytes32 hash) internal view returns (bytes32) {
        return
            timelock.hashOperationBatch(
                targets, values, calldatas, bytes32(0), bytes32(bytes20(address(governor))) ^ hash
            );
    }

    function _queueSuccessful() internal returns (uint256 id, bytes32 operation) {
        id = _successful();
        governor.queue(targets, values, calldatas, _descriptionHash());
        operation = _operation(_descriptionHash());
        vm.warp(governor.proposalEta(id));
    }

    function _assertUnpaid(uint256 id, IGovernor.ProposalState expected) internal view {
        _state(id, expected);
        assertEq(bud.balanceOf(address(treasury)), 10_000 ether);
        assertEq(bud.balanceOf(recipient), 0);
        assertEq(bud.balanceOf(outsider), 0);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    // Mutate exactly one hash input, leaving the created proposal's identity unchanged.
    function _tamper(uint256 field) internal returns (bytes32 hash) {
        hash = _descriptionHash();
        if (field == 0) calldatas[0] = abi.encodeCall(ITreasury.disburse, (REQUEST, outsider, 1_000 ether));
        if (field == 1) calldatas[0] = abi.encodeCall(ITreasury.disburse, (REQUEST, recipient, 999 ether));
        if (field == 2) hash = keccak256("different description");
    }

    function _queueTampering(uint256 field) internal {
        uint256 id = _successful();
        bytes32 originalOperation = _operation(_descriptionHash());
        bytes32 hash = _tamper(field);
        uint256 altered = governor.hashProposal(targets, values, calldatas, hash);
        assertTrue(id != altered);
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorNonexistentProposal.selector, altered));
        governor.queue(targets, values, calldatas, hash);
        _assertUnpaid(id, IGovernor.ProposalState.Succeeded);
        assertFalse(timelock.isOperation(originalOperation));
        assertFalse(timelock.isOperation(_operation(hash)));
    }

    function testQueueChangedRecipientRejected() public {
        _queueTampering(0);
    }

    function testQueueChangedAmountRejected() public {
        _queueTampering(1);
    }

    function testQueueChangedDescriptionHashRejected() public {
        _queueTampering(2);
    }

    function _executeTampering(uint256 field) internal {
        (uint256 id, bytes32 operation) = _queueSuccessful();
        bytes32 hash = _tamper(field);
        uint256 altered = governor.hashProposal(targets, values, calldatas, hash);
        assertTrue(id != altered);
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorNonexistentProposal.selector, altered));
        governor.execute(targets, values, calldatas, hash);
        _assertUnpaid(id, IGovernor.ProposalState.Queued);
        assertTrue(timelock.isOperationReady(operation));
        assertFalse(timelock.isOperationDone(operation));
    }

    function testExecuteChangedRecipientRejected() public {
        _executeTampering(0);
    }

    function testExecuteChangedAmountRejected() public {
        _executeTampering(1);
    }

    function testExecuteChangedDescriptionHashRejected() public {
        _executeTampering(2);
    }

    function _nonexistent(bool execute) internal {
        uint256 id = governor.hashProposal(targets, values, calldatas, _descriptionHash());
        bytes32 operation = _operation(_descriptionHash());
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorNonexistentProposal.selector, id));
        if (execute) governor.execute(targets, values, calldatas, _descriptionHash());
        else governor.queue(targets, values, calldatas, _descriptionHash());
        assertEq(governor.proposalSnapshot(id), 0);
        assertEq(governor.proposalEta(id), 0);
        assertFalse(timelock.isOperation(operation));
        assertEq(bud.balanceOf(address(treasury)), 10_000 ether);
        assertEq(bud.balanceOf(recipient), 0);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testQueueNonexistentProposalRejected() public {
        _nonexistent(false);
    }

    function testExecuteNonexistentProposalRejected() public {
        _nonexistent(true);
    }

    function testSuccessfulExecuteCannotReplay() public {
        (uint256 id, bytes32 operation) = _queueSuccessful();
        governor.execute(targets, values, calldatas, _descriptionHash());
        vm.expectRevert(
            abi.encodeWithSelector(
                IGovernor.GovernorUnexpectedProposalState.selector,
                id,
                IGovernor.ProposalState.Executed,
                bytes32(
                    (uint256(1) << uint8(IGovernor.ProposalState.Succeeded))
                        | (uint256(1) << uint8(IGovernor.ProposalState.Queued))
                )
            )
        );
        governor.execute(targets, values, calldatas, _descriptionHash());
        _state(id, IGovernor.ProposalState.Executed);
        assertTrue(timelock.isOperationDone(operation));
        assertTrue(treasury.paidRequests(REQUEST));
        assertEq(bud.balanceOf(address(treasury)), 9_000 ether);
        assertEq(bud.balanceOf(recipient), 1_000 ether);
        assertEq(bud.totalSupply(), 20_000 ether);
    }

    function testDistinctProposalsSharingRequestPayOnlyOnce() public {
        uint256 first = _create();
        string memory secondDescription = string.concat(DESCRIPTION, " ");
        bytes32 secondHash = keccak256(bytes(secondDescription));
        vm.prank(b);
        uint256 second = governor.propose(targets, values, calldatas, secondDescription);
        assertTrue(first != second);
        _active(first);
        _vote(a, first, 1);
        _vote(a, second, 1);
        _finish(first);
        governor.queue(targets, values, calldatas, _descriptionHash());
        governor.queue(targets, values, calldatas, secondHash);
        bytes32 firstOperation = _operation(_descriptionHash());
        bytes32 secondOperation = _operation(secondHash);
        vm.warp(governor.proposalEta(first));
        governor.execute(targets, values, calldatas, _descriptionHash());
        vm.expectRevert(abi.encodeWithSelector(Treasury.RequestAlreadyPaid.selector, REQUEST));
        governor.execute(targets, values, calldatas, secondHash);
        _state(first, IGovernor.ProposalState.Executed);
        _state(second, IGovernor.ProposalState.Queued);
        assertTrue(timelock.isOperationDone(firstOperation));
        assertTrue(timelock.isOperationReady(secondOperation));
        assertFalse(timelock.isOperationDone(secondOperation));
        assertTrue(treasury.paidRequests(REQUEST));
        assertEq(bud.balanceOf(address(treasury)), 9_000 ether);
        assertEq(bud.balanceOf(recipient), 1_000 ether);
    }

    function testExecuteInsufficientBudgetRollsBackAndRetries() public {
        calldatas[0] = abi.encodeCall(ITreasury.disburse, (REQUEST, recipient, 11_000 ether));
        (uint256 id, bytes32 operation) = _queueSuccessful();
        uint256 eta = governor.proposalEta(id);
        vm.expectRevert(abi.encodeWithSelector(Treasury.InsufficientBudget.selector, 10_000 ether, 11_000 ether));
        governor.execute(targets, values, calldatas, _descriptionHash());
        _assertUnpaid(id, IGovernor.ProposalState.Queued);
        assertEq(governor.proposalEta(id), eta);
        assertEq(timelock.getTimestamp(operation), eta);
        assertTrue(timelock.isOperationReady(operation));
        assertFalse(timelock.isOperationDone(operation));
        bud.transfer(address(treasury), 1_000 ether);
        governor.execute(targets, values, calldatas, _descriptionHash());
        _state(id, IGovernor.ProposalState.Executed);
        assertTrue(timelock.isOperationDone(operation));
        assertTrue(treasury.paidRequests(REQUEST));
        assertEq(bud.balanceOf(address(treasury)), 0);
        assertEq(bud.balanceOf(recipient), 11_000 ether);
        assertEq(bud.balanceOf(address(this)), 9_000 ether);
        assertEq(bud.totalSupply(), 20_000 ether);
    }

    function _truncatedPayload(uint256 length) internal {
        bytes memory valid = calldatas[0];
        bytes memory truncated = new bytes(length);
        for (uint256 i = 0; i < length; ++i) {
            truncated[i] = valid[i];
        }
        assertEq(bytes4(truncated), ITreasury.disburse.selector);
        _rejectPayload(truncated, abi.encodeWithSelector(BudgetGovernor.InvalidCalldata.selector));
        assertEq(bud.balanceOf(address(treasury)), 10_000 ether);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testCorrectSelectorTruncatedTo4BytesRejected() public {
        _truncatedPayload(4);
    }

    function testCorrectSelectorTruncatedTo35BytesRejected() public {
        _truncatedPayload(35);
    }

    function testCorrectSelectorTruncatedTo36BytesRejected() public {
        _truncatedPayload(36);
    }

    function testCorrectSelectorTruncatedTo67BytesRejected() public {
        _truncatedPayload(67);
    }

    function testCorrectSelectorTruncatedTo68BytesRejected() public {
        _truncatedPayload(68);
    }

    function testCorrectSelectorTruncatedTo99BytesRejected() public {
        _truncatedPayload(99);
    }

    function testFuzzDirtyAddressPaddingWithValidSelector(uint8 index, uint8 value) public {
        bytes memory data = calldatas[0];
        data[36 + bound(index, 0, 11)] = bytes1(uint8(bound(value, 1, 255)));
        assertEq(bytes4(data), ITreasury.disburse.selector);
        assertEq(data.length, 100);
        calldatas[0] = data;
        vm.expectRevert(); // Canonical address decoding fails without custom error.
        vm.prank(a);
        governor.propose(targets, values, calldatas, DESCRIPTION);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testFuzzValidPayloadWithTrailingBytesRejected(bytes memory extra) public {
        vm.assume(extra.length > 0);
        _rejectPayload(
            bytes.concat(calldatas[0], extra), abi.encodeWithSelector(BudgetGovernor.InvalidCalldata.selector)
        );
        assertEq(bud.balanceOf(address(treasury)), 10_000 ether);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function _sensitiveCalls() internal view returns (bytes[] memory calls) {
        calls = new bytes[](6);
        calls[0] = abi.encodeCall(governor.relay, (address(treasury), 0, calldatas[0]));
        calls[1] = abi.encodeCall(governor.updateTimelock, (timelock));
        calls[2] = abi.encodeCall(governor.setVotingDelay, (uint48(1)));
        calls[3] = abi.encodeCall(governor.setVotingPeriod, (uint32(1)));
        calls[4] = abi.encodeCall(governor.setProposalThreshold, (uint256(0)));
        calls[5] = abi.encodeCall(governor.updateQuorumNumerator, (uint256(0)));
    }

    function _assertConfigUnchanged() internal view {
        assertEq(governor.votingDelay(), 60);
        assertEq(governor.votingPeriod(), 300);
        assertEq(governor.proposalThreshold(), 50 ether);
        assertEq(governor.quorumNumerator(), 20);
        assertEq(governor.timelock(), address(timelock));
        assertEq(bud.balanceOf(address(treasury)), 10_000 ether);
        assertEq(bud.balanceOf(recipient), 0);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testAllSensitiveCallsRejectOrdinaryWallet() public {
        bytes[] memory calls = _sensitiveCalls();
        for (uint256 i = 0; i < calls.length; ++i) {
            vm.prank(outsider);
            (bool success, bytes memory result) = address(governor).call(calls[i]);
            assertFalse(success);
            assertEq(result, abi.encodeWithSelector(IGovernor.GovernorOnlyExecutor.selector, outsider));
            _assertConfigUnchanged();
        }
    }

    function testTimelockIdentityAloneCannotInvokeSensitiveCalls() public {
        bytes[] memory calls = _sensitiveCalls();
        for (uint256 i = 0; i < calls.length; ++i) {
            // Stronger adversarial fixture: impersonate executor, but no authorized governance calldata exists.
            vm.prank(address(timelock));
            (bool success, bytes memory result) = address(governor).call(calls[i]);
            assertFalse(success);
            assertEq(result, abi.encodeWithSignature("Panic(uint256)", uint256(0x31)));
            _assertConfigUnchanged();
        }
    }

    function _signedFixture() internal returns (uint256 key, address voter, uint256 id) {
        key = 0xA11CE; // Synthetic test key only, not a deployment account.
        voter = vm.addr(key);
        vm.prank(a);
        gov.transfer(voter, 100 ether);
        vm.prank(voter);
        gov.delegate(voter);
        vm.warp(block.timestamp + 1);
        id = _create();
    }

    function _signBallot(uint256 key, bytes32 structHash) internal view returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(governor.name())),
                keccak256(bytes(governor.version())),
                block.chainid,
                address(governor)
            )
        );
        (uint8 v, bytes32 r, bytes32 sigS) = vm.sign(key, keccak256(abi.encodePacked(hex"1901", domain, structHash)));
        return abi.encodePacked(r, sigS, v);
    }

    function _ballot(uint256 key, uint256 id, address voter, uint8 support) internal view returns (bytes memory) {
        return
            _signBallot(
                key, keccak256(abi.encode(governor.BALLOT_TYPEHASH(), id, support, voter, governor.nonces(voter)))
            );
    }

    function testSignedVoteUsesSnapshotAndRejectsReplay() public {
        (uint256 key, address voter, uint256 id) = _signedFixture();
        _active(id);
        vm.prank(voter);
        gov.transfer(a, 100 ether);
        assertEq(gov.getVotes(voter), 0);
        bytes memory signature = _ballot(key, id, voter, 1);
        vm.prank(outsider);
        assertEq(governor.castVoteBySig(id, 1, voter, signature), 100 ether);
        assertEq(governor.nonces(voter), 1);
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorInvalidSignature.selector, voter));
        governor.castVoteBySig(id, 1, voter, signature);
        assertEq(governor.nonces(voter), 1);
        (, uint256 forVotes,) = governor.proposalVotes(id);
        assertEq(forVotes, 100 ether);
        _assertUnpaid(id, IGovernor.ProposalState.Active);
    }

    function testTamperedSignedSupportRejectedWithoutConsumingNonce() public {
        (uint256 key, address voter, uint256 id) = _signedFixture();
        _active(id);
        bytes memory signature = _ballot(key, id, voter, 1);
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorInvalidSignature.selector, voter));
        governor.castVoteBySig(id, 0, voter, signature);
        assertEq(governor.nonces(voter), 0);
        assertFalse(governor.hasVoted(id, voter));
        assertEq(governor.castVoteBySig(id, 1, voter, signature), 100 ether);
    }

    function testSignedVoteBeforeActiveRollsBackNonceAndCanRetry() public {
        (uint256 key, address voter, uint256 id) = _signedFixture();
        bytes memory signature = _ballot(key, id, voter, 1);
        _expectState(id, IGovernor.ProposalState.Pending, IGovernor.ProposalState.Active);
        governor.castVoteBySig(id, 1, voter, signature);
        assertEq(governor.nonces(voter), 0);
        assertFalse(governor.hasVoted(id, voter));
        _active(id);
        assertEq(governor.castVoteBySig(id, 1, voter, signature), 100 ether);
        assertEq(governor.nonces(voter), 1);
    }

    function testSignedVoteAfterDeadlineRejectedAndNonceUnchanged() public {
        (uint256 key, address voter, uint256 id) = _signedFixture();
        bytes memory signature = _ballot(key, id, voter, 1);
        _finish(id);
        _expectState(id, IGovernor.ProposalState.Defeated, IGovernor.ProposalState.Active);
        governor.castVoteBySig(id, 1, voter, signature);
        assertEq(governor.nonces(voter), 0);
        assertFalse(governor.hasVoted(id, voter));
        _assertUnpaid(id, IGovernor.ProposalState.Defeated);
    }

    function testVoteWithParamsCannotInjectWeightOrVoteTwice() public {
        (, address voter, uint256 id) = _signedFixture();
        _active(id);
        vm.prank(voter);
        gov.delegate(b);
        vm.prank(voter);
        assertEq(
            governor.castVoteWithReasonAndParams(id, 1, "params cannot set weight", abi.encode(type(uint256).max)),
            100 ether
        );
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorAlreadyCastVote.selector, voter));
        _vote(voter, id, 0);
        (, uint256 forVotes,) = governor.proposalVotes(id);
        assertEq(forVotes, 100 ether);
    }

    function testExtendedSignedVoteSnapshotParamsAndReplay() public {
        (uint256 key, address voter, uint256 id) = _signedFixture();
        _active(id);
        vm.prank(voter);
        gov.delegate(b);
        string memory reason = "signed params";
        bytes memory params = abi.encode(type(uint256).max);
        bytes memory signature = _signBallot(
            key,
            keccak256(
                abi.encode(
                    governor.EXTENDED_BALLOT_TYPEHASH(),
                    id,
                    uint8(1),
                    voter,
                    governor.nonces(voter),
                    keccak256(bytes(reason)),
                    keccak256(params)
                )
            )
        );
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorInvalidSignature.selector, voter));
        governor.castVoteWithReasonAndParamsBySig(id, 1, voter, reason, hex"01", signature);
        assertEq(governor.nonces(voter), 0);
        assertFalse(governor.hasVoted(id, voter));
        assertEq(governor.castVoteWithReasonAndParamsBySig(id, 1, voter, reason, params, signature), 100 ether);
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorInvalidSignature.selector, voter));
        governor.castVoteWithReasonAndParamsBySig(id, 1, voter, reason, params, signature);
        assertEq(governor.nonces(voter), 1);
        (, uint256 forVotes,) = governor.proposalVotes(id);
        assertEq(forVotes, 100 ether);
    }

    function testCopiedProposalCannotReplaceFirstCreatorOrCancelRights() public {
        assertGe(gov.getPastVotes(a, governor.clock() - 1), 50 ether);
        assertGe(gov.getPastVotes(b, governor.clock() - 1), 50 ether);
        uint256 first = _create();
        uint256 copied = governor.hashProposal(targets, values, calldatas, _descriptionHash());
        assertEq(first, copied);
        vm.expectRevert(
            abi.encodeWithSelector(
                IGovernor.GovernorUnexpectedProposalState.selector, first, IGovernor.ProposalState.Pending, bytes32(0)
            )
        );
        vm.prank(b);
        governor.propose(targets, values, calldatas, DESCRIPTION);
        assertEq(governor.proposalProposer(first), a);
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorUnableToCancel.selector, first, b));
        vm.prank(b);
        governor.cancel(targets, values, calldatas, _descriptionHash());
        _state(first, IGovernor.ProposalState.Pending);
        vm.prank(a);
        governor.cancel(targets, values, calldatas, _descriptionHash());
        _state(first, IGovernor.ProposalState.Canceled);
        assertEq(governor.proposalProposer(first), a);
        assertFalse(treasury.paidRequests(REQUEST));
        assertEq(bud.balanceOf(address(treasury)), 10_000 ether);
    }
}
