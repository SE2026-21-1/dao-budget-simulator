// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {GovernanceToken} from "../../contracts/GovernanceToken.sol";
import {BudgetToken} from "../../contracts/BudgetToken.sol";
import {Treasury} from "../../contracts/Treasury.sol";
import {BudgetGovernor} from "../../contracts/BudgetGovernor.sol";
import {ITreasury} from "../../contracts/interfaces/ITreasury.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @notice SC05 integration acceptance after a complete, audited bootstrap.
/// @dev No successful payment impersonates Governor/Timelock. Production scripts remain TV4-owned.
contract TimelockGovernanceTest is Test {
    GovernanceToken internal gov;
    BudgetToken internal bud;
    Treasury internal treasury;
    BudgetGovernor internal governor;
    TimelockController internal timelock;
    address internal deployer = makeAddr("deployer");
    address internal temporary = makeAddr("secondBootstrap");
    address internal funding = makeAddr("funding");
    address internal a = makeAddr("A");
    address internal b = makeAddr("B");
    address internal c = makeAddr("C");
    address internal d = makeAddr("D");
    address internal queueUser = makeAddr("queueWithoutGov");
    address internal executeUser = makeAddr("executeWithoutGov");
    address internal recipient = makeAddr("recipient");
    address internal otherRecipient = makeAddr("otherRecipient");
    bytes32 internal constant REQUEST = keccak256("SC05-request");
    bytes32 internal constant ADMIN = bytes32(0);
    bytes32 internal constant SPENDER = keccak256("SPENDER_ROLE");
    bytes32 internal constant PROPOSER = keccak256("PROPOSER_ROLE");
    bytes32 internal constant EXECUTOR = keccak256("EXECUTOR_ROLE");
    bytes32 internal constant CANCELLER = keccak256("CANCELLER_ROLE");
    bytes32 internal constant GRANTED = keccak256("RoleGranted(bytes32,address,address)");
    bytes32 internal constant REVOKED = keccak256("RoleRevoked(bytes32,address,address)");
    bytes internal bootstrapHistory;

    struct Payment {
        uint256 id;
        bytes32 request;
        address to;
        uint256 amount;
        bytes payload;
        bytes32 descriptionHash;
        bytes32 operation;
        uint256 eta;
    }

    Payment internal stalePayment;
    bytes internal preflightHistory;

    function setUp() public {
        _bootstrap(0);
    }

    // Nonzero modes deliberately model rejected or unsafe bootstrap configurations.
    function _bootstrap(uint256 mode) internal {
        vm.warp(10_000);
        vm.recordLogs();
        vm.startPrank(deployer);
        gov = new GovernanceToken(a, b, c, d);
        bud = new BudgetToken(funding);
        treasury = new Treasury(address(bud), deployer);
        timelock = new TimelockController(mode == 6 ? 121 : 120, new address[](0), new address[](0), deployer);
        governor = new BudgetGovernor(address(gov), address(treasury), address(timelock));
        assertTrue(treasury.hasRole(ADMIN, deployer));
        assertFalse(treasury.hasRole(SPENDER, deployer));
        assertTrue(timelock.hasRole(ADMIN, address(timelock)));
        // Deliberately create multiple temporary holders so renouncing only admin cannot pass the audit.
        treasury.grantRole(ADMIN, temporary);
        timelock.grantRole(ADMIN, temporary);
        treasury.grantRole(SPENDER, deployer);
        treasury.grantRole(SPENDER, temporary);
        bytes32[3] memory roles = [PROPOSER, EXECUTOR, CANCELLER];
        for (uint256 i; i < roles.length; ++i) {
            timelock.grantRole(roles[i], deployer);
            timelock.grantRole(roles[i], temporary);
            timelock.grantRole(roles[i], address(governor));
        }
        treasury.grantRole(SPENDER, address(timelock));
        treasury.grantRole(ADMIN, address(timelock));
        treasury.revokeRole(SPENDER, deployer);
        treasury.revokeRole(SPENDER, temporary);
        treasury.revokeRole(ADMIN, temporary);
        for (uint256 i; i < roles.length; ++i) {
            timelock.revokeRole(roles[i], deployer);
            timelock.revokeRole(roles[i], temporary);
        }
        timelock.revokeRole(ADMIN, temporary);
        vm.stopPrank();
        vm.prank(a);
        gov.delegate(a);
        vm.prank(b);
        gov.delegate(b);
        vm.warp(block.timestamp + 1);
        if (mode == 1 || mode == 7) {
            Payment memory p = _create(REQUEST, recipient, 1_000 ether, "Bootstrap stale operation");
            p.eta = block.timestamp + 120;
            stalePayment = p;
            (address[] memory targets, uint256[] memory values, bytes[] memory data) = _actions(p);
            vm.startPrank(deployer);
            timelock.grantRole(PROPOSER, temporary);
            vm.stopPrank();
            vm.prank(temporary);
            timelock.scheduleBatch(
                targets, values, data, 0, bytes32(bytes20(address(governor))) ^ p.descriptionHash, 120
            );
            vm.prank(deployer);
            timelock.revokeRole(PROPOSER, temporary);
        }
        vm.startPrank(deployer);
        if (mode == 2) timelock.revokeRole(EXECUTOR, address(governor));
        if (mode == 3) timelock.grantRole(PROPOSER, makeAddr("unknownHolder"));
        if (mode == 4) timelock.grantRole(EXECUTOR, address(0));
        vm.stopPrank();
        VmSafe.Log[] memory beforeRenounce = vm.getRecordedLogs();
        preflightHistory = abi.encode(beforeRenounce);
        if (mode >= 2) return; // Leave bootstrap authority intact for negative-control preflight tests.
        if (mode == 0) _preflight(beforeRenounce, 120, address(bud));
        // mode 1 intentionally skips operation preflight to demonstrate the unsafe handoff.
        vm.recordLogs();
        vm.startPrank(deployer);
        treasury.renounceRole(ADMIN, deployer);
        timelock.renounceRole(ADMIN, deployer);
        vm.stopPrank();
        VmSafe.Log[] memory ending = vm.getRecordedLogs();
        VmSafe.Log[] memory history = new VmSafe.Log[](beforeRenounce.length + ending.length);
        for (uint256 i; i < beforeRenounce.length; ++i) {
            history[i] = beforeRenounce[i];
        }
        for (uint256 i; i < ending.length; ++i) {
            history[beforeRenounce.length + i] = ending[i];
        }
        bootstrapHistory = abi.encode(history);
        _assertFinalRoles();
        _auditRoleHistory(history);
        // No budget is present until all authority has reached final state.
        assertEq(bud.balanceOf(address(treasury)), 0);
        vm.prank(funding);
        bud.transfer(address(treasury), 10_000 ether);
        vm.prank(a);
        gov.delegate(a);
        vm.prank(b);
        gov.delegate(b);
        vm.prank(c);
        gov.delegate(c);
        vm.prank(d);
        gov.delegate(d);
        vm.warp(block.timestamp + 1);
    }

    function _allowed(address contractAddress, bytes32 role, address account) internal view returns (bool) {
        if (contractAddress == address(treasury)) {
            return (role == ADMIN || role == SPENDER) && account == address(timelock);
        }
        if (role == ADMIN) return account == address(timelock);
        return (role == PROPOSER || role == EXECUTOR || role == CANCELLER) && account == address(governor);
    }

    function _auditRoleHistory(VmSafe.Log[] memory history) internal view {
        _auditHistory(history, false);
    }

    function _adminGraph() internal view {
        require(
            treasury.getRoleAdmin(ADMIN) == ADMIN && treasury.getRoleAdmin(SPENDER) == ADMIN, "treasury admin graph"
        );
        require(timelock.getRoleAdmin(ADMIN) == ADMIN, "timelock admin graph");
        require(timelock.getRoleAdmin(PROPOSER) == ADMIN, "proposer admin graph");
        require(timelock.getRoleAdmin(EXECUTOR) == ADMIN, "executor admin graph");
        require(timelock.getRoleAdmin(CANCELLER) == ADMIN, "canceller admin graph");
    }

    function _auditHistory(VmSafe.Log[] memory history, bool beforeRenounce) internal view {
        _adminGraph();
        uint256 changes;
        for (uint256 i; i < history.length; ++i) {
            VmSafe.Log memory e = history[i];
            if (e.emitter != address(treasury) && e.emitter != address(timelock)) continue;
            require(
                e.topics.length == 0 || e.topics[0] != keccak256("RoleAdminChanged(bytes32,bytes32,bytes32)"),
                "unexpected admin change"
            );
            if (e.topics.length != 4 || (e.topics[0] != GRANTED && e.topics[0] != REVOKED)) continue;
            bytes32 role = e.topics[1];
            address account = address(uint160(uint256(e.topics[2])));
            // Replay this exact contract/role/account pair from its FIRST event through the whole history.
            bool projected;
            for (uint256 j; j < history.length; ++j) {
                VmSafe.Log memory change = history[j];
                if (
                    change.emitter == e.emitter && change.topics.length == 4 && change.topics[1] == role
                        && change.topics[2] == e.topics[2]
                ) {
                    if (change.topics[0] == GRANTED) projected = true;
                    if (change.topics[0] == REVOKED) projected = false;
                }
            }
            assertEq(IAccessControl(e.emitter).hasRole(role, account), projected, "role replay mismatch");
            bool expected =
                _allowed(e.emitter, role, account) || (beforeRenounce && role == ADMIN && account == deployer);
            require(projected == expected, "unexpected role holder");
            changes++;
        }
        assertGt(changes, 20, "bootstrap audit must cover grants and revocations");
    }

    // Test-only preflight: conservative empty-operation policy, complete fixture logs, pinned local chain.
    // TV4 must additionally verify manifest receipts and reproducible runtime bytecode on the real chain.
    function _preflight(VmSafe.Log[] memory history, uint256 expectedDelay, address expectedBud) internal view {
        require(block.chainid == 31337, "chain mismatch");
        require(address(gov).code.length > 0 && address(bud).code.length > 0, "token code missing");
        require(
            address(treasury).code.length > 0 && address(governor).code.length > 0 && address(timelock).code.length > 0,
            "code missing"
        );
        require(
            address(governor.token()) == address(gov) && governor.timelock() == address(timelock)
                && address(governor.treasury()) == address(treasury) && address(treasury.budgetToken()) == expectedBud,
            "link mismatch"
        );
        require(timelock.getMinDelay() == expectedDelay, "delay mismatch");
        require(treasury.hasRole(ADMIN, deployer) && timelock.hasRole(ADMIN, deployer), "bootstrap admin missing");
        require(
            treasury.hasRole(ADMIN, address(timelock)) && treasury.hasRole(SPENDER, address(timelock))
                && timelock.hasRole(ADMIN, address(timelock)) && timelock.hasRole(PROPOSER, address(governor))
                && timelock.hasRole(EXECUTOR, address(governor)) && timelock.hasRole(CANCELLER, address(governor)),
            "final role missing"
        );
        _auditHistory(history, true);
        for (uint256 i; i < history.length; ++i) {
            if (history[i].emitter != address(timelock) || history[i].topics.length == 0) continue;
            require(
                history[i].topics[0]
                    != keccak256("CallScheduled(bytes32,uint256,address,uint256,bytes,bytes32,uint256)"),
                "bootstrap operation detected"
            );
        }
    }

    function preflight(bytes calldata history, uint256 expectedDelay, address expectedBud) external view {
        _preflight(abi.decode(history, (VmSafe.Log[])), expectedDelay, expectedBud);
    }

    function testStaleBootstrapOperationExecutesSucceededWithoutGovernorQueue() public {
        _bootstrap(1);
        Payment memory p = stalePayment;
        uint256 eta = timelock.getTimestamp(p.operation);
        assertEq(eta, p.eta);
        assertTrue(timelock.isOperationPending(p.operation));
        assertFalse(timelock.hasRole(PROPOSER, temporary));
        _assertFinalRoles();
        _succeed(p);
        _state(p, IGovernor.ProposalState.Succeeded);
        assertEq(governor.proposalEta(p.id), 0);
        assertGt(block.timestamp, eta);
        assertTrue(timelock.isOperationReady(p.operation));
        _assertUnpaid(p, 10_000 ether);
        _execute(p); // Intentionally no Governor.queue().
        _state(p, IGovernor.ProposalState.Executed);
        assertTrue(timelock.isOperationDone(p.operation));
        assertEq(governor.proposalEta(p.id), 0);
        assertEq(timelock.getTimestamp(p.operation), 1);
        assertTrue(treasury.paidRequests(p.request));
        assertEq(bud.balanceOf(address(treasury)), 9_000 ether);
        assertEq(bud.balanceOf(recipient), 1_000 ether);
        emit log_named_bytes32("stale operationId", p.operation);
        emit log_named_uint("bootstrap ETA", eta);
    }

    function testCleanBootstrapRequiresQueueBeforeExecute() public {
        Payment memory p = _create(REQUEST, recipient, 1_000 ether, "Clean bootstrap");
        _succeed(p);
        assertFalse(timelock.isOperation(p.operation));
        vm.expectRevert(
            abi.encodeWithSelector(
                TimelockController.TimelockUnexpectedOperationState.selector,
                p.operation,
                bytes32(uint256(1) << uint8(TimelockController.OperationState.Ready))
            )
        );
        _execute(p);
        _state(p, IGovernor.ProposalState.Succeeded);
        _assertUnpaid(p, 10_000 ether);
        _queue(p);
        assertEq(p.eta, block.timestamp + 120);
        vm.warp(p.eta);
        _execute(p);
        assertTrue(timelock.isOperationDone(p.operation));
    }

    function _rejectPreflight(uint256 mode, uint256 delay, address token, string memory reason) internal {
        _bootstrap(mode);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", reason));
        this.preflight(preflightHistory, delay, token == address(0) ? address(bud) : token);
        assertTrue(treasury.hasRole(ADMIN, deployer));
        assertTrue(timelock.hasRole(ADMIN, deployer));
        assertEq(bud.balanceOf(address(treasury)), 0);
    }

    function testPreflightRejectsMissingExecutorBeforeRenounce() public {
        _rejectPreflight(2, 120, address(0), "final role missing");
    }

    function testHistoryAuditorRejectsUnknownBootstrapHolder() public {
        _rejectPreflight(3, 120, address(0), "unexpected role holder");
    }

    function testHistoryAuditorRejectsPublicExecutor() public {
        _rejectPreflight(4, 120, address(0), "unexpected role holder");
    }

    function testPreflightRejectsWrongDelay() public {
        _rejectPreflight(6, 120, address(0), "delay mismatch");
    }

    function testPreflightRejectsWrongTokenLink() public {
        _rejectPreflight(5, 120, otherRecipient, "link mismatch");
    }

    function testPreflightRejectsWrongChain() public {
        _bootstrap(5);
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "chain mismatch"));
        this.preflight(preflightHistory, 120, address(bud));
        assertTrue(timelock.hasRole(ADMIN, deployer));
    }

    function testPreflightRejectsStaleScheduledOperationBeforeRenounce() public {
        _rejectPreflight(7, 120, address(0), "bootstrap operation detected");
        assertTrue(timelock.isOperationPending(stalePayment.operation));
    }

    function testAdminGraphAndNoBootstrapAdminChanges() public view {
        _adminGraph();
        _auditRoleHistory(abi.decode(bootstrapHistory, (VmSafe.Log[])));
    }

    function testAuditorRejectsUnexpectedAdminChangedLog() public {
        _bootstrap(5);
        VmSafe.Log[] memory original = abi.decode(preflightHistory, (VmSafe.Log[]));
        VmSafe.Log[] memory altered = new VmSafe.Log[](original.length + 1);
        for (uint256 i; i < original.length; ++i) {
            altered[i] = original[i];
        }
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = keccak256("RoleAdminChanged(bytes32,bytes32,bytes32)");
        topics[1] = PROPOSER;
        topics[2] = ADMIN;
        topics[3] = SPENDER;
        altered[original.length] = VmSafe.Log(topics, hex"", address(timelock));
        // Synthetic log tests the auditor only; production Timelock exposes no admin-graph setter.
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "unexpected admin change"));
        this.preflight(abi.encode(altered), 120, address(bud));
        assertTrue(timelock.hasRole(ADMIN, deployer));
    }

    function _assertFinalRoles() internal view {
        assertTrue(treasury.hasRole(ADMIN, address(timelock)));
        assertTrue(treasury.hasRole(SPENDER, address(timelock)));
        assertTrue(timelock.hasRole(ADMIN, address(timelock)));
        assertTrue(timelock.hasRole(PROPOSER, address(governor)));
        assertTrue(timelock.hasRole(EXECUTOR, address(governor)));
        assertTrue(timelock.hasRole(CANCELLER, address(governor)));
        address[8] memory candidates = [deployer, temporary, a, b, funding, queueUser, executeUser, address(0)];
        for (uint256 i; i < candidates.length; ++i) {
            assertFalse(treasury.hasRole(ADMIN, candidates[i]));
            assertFalse(treasury.hasRole(SPENDER, candidates[i]));
            assertFalse(timelock.hasRole(ADMIN, candidates[i]));
            assertFalse(timelock.hasRole(PROPOSER, candidates[i]));
            assertFalse(timelock.hasRole(EXECUTOR, candidates[i]));
            assertFalse(timelock.hasRole(CANCELLER, candidates[i]));
        }
        assertFalse(treasury.hasRole(SPENDER, address(governor)));
        assertFalse(treasury.hasRole(ADMIN, address(governor)));
        assertFalse(timelock.hasRole(ADMIN, address(governor)));
        assertEq(timelock.getMinDelay(), 120);
    }

    function _actions(Payment memory p)
        internal
        view
        returns (address[] memory targets, uint256[] memory values, bytes[] memory data)
    {
        targets = new address[](1);
        targets[0] = address(treasury);
        values = new uint256[](1);
        data = new bytes[](1);
        data[0] = p.payload;
    }

    function _create(bytes32 request, address to, uint256 amount, string memory label)
        internal
        returns (Payment memory p)
    {
        p.request = request;
        p.to = to;
        p.amount = amount;
        p.payload = abi.encodeCall(ITreasury.disburse, (request, to, amount));
        string memory description =
            string.concat('{"version":1,"title":"', label, '","body":"Chi ngan sach DAO qua Governor va Timelock."}');
        p.descriptionHash = keccak256(bytes(description));
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _actions(p);
        vm.prank(a);
        p.id = governor.propose(targets, values, data, description);
        p.operation = timelock.hashOperationBatch(
            targets, values, data, bytes32(0), bytes32(bytes20(address(governor))) ^ p.descriptionHash
        );
    }

    function _vote(Payment memory p) internal {
        vm.prank(a);
        assertEq(governor.castVote(p.id, 1), 400 ether);
        vm.prank(b);
        assertEq(governor.castVote(p.id, 1), 300 ether);
    }

    function _succeed(Payment memory p) internal {
        vm.warp(governor.proposalSnapshot(p.id) + 1);
        _vote(p);
        vm.warp(governor.proposalDeadline(p.id) + 1);
        _state(p, IGovernor.ProposalState.Succeeded);
    }

    function _state(Payment memory p, IGovernor.ProposalState expected) internal view {
        assertEq(uint256(governor.state(p.id)), uint256(expected));
    }

    function _queue(Payment memory p) internal {
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _actions(p);
        vm.prank(queueUser);
        governor.queue(targets, values, data, p.descriptionHash);
        p.eta = governor.proposalEta(p.id);
    }

    function _execute(Payment memory p) internal {
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _actions(p);
        vm.prank(executeUser);
        governor.execute(targets, values, data, p.descriptionHash);
    }

    function _queued() internal returns (Payment memory p) {
        p = _create(REQUEST, recipient, 1_000 ether, "SC05 demo payment");
        _succeed(p);
        _queue(p);
    }

    function _assertUnpaid(Payment memory p, uint256 balance) internal view {
        assertFalse(treasury.paidRequests(p.request));
        assertEq(bud.balanceOf(address(treasury)), balance);
        assertEq(bud.balanceOf(p.to), 0);
    }

    function _denied(address caller, bytes32 role) internal {
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, caller, role));
    }

    function _rejectQueue(Payment memory p, IGovernor.ProposalState state) internal {
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _actions(p);
        vm.expectRevert(
            abi.encodeWithSelector(
                IGovernor.GovernorUnexpectedProposalState.selector,
                p.id,
                state,
                bytes32(uint256(1) << uint8(IGovernor.ProposalState.Succeeded))
            )
        );
        vm.prank(queueUser);
        governor.queue(targets, values, data, p.descriptionHash);
        _state(p, state);
        _assertUnpaid(p, 10_000 ether);
        assertFalse(timelock.isOperation(p.operation));
    }

    function testFinalRoleMatrixAndFullBootstrapHistory() public view {
        _assertFinalRoles();
        _auditRoleHistory(abi.decode(bootstrapHistory, (VmSafe.Log[])));
        assertEq(address(governor.token()), address(gov));
        assertEq(address(governor.treasury()), address(treasury));
        assertEq(governor.timelock(), address(timelock));
        assertEq(address(treasury.budgetToken()), address(bud));
        assertEq(bud.balanceOf(address(treasury)), 10_000 ether);
        assertEq(bud.balanceOf(funding), 10_000 ether);
    }

    function testCannotQueuePending() public {
        Payment memory p = _create(REQUEST, recipient, 1_000 ether, "Pending queue");
        _rejectQueue(p, IGovernor.ProposalState.Pending);
    }

    function testCannotQueueActive() public {
        Payment memory p = _create(REQUEST, recipient, 1_000 ether, "Active queue");
        vm.warp(governor.proposalSnapshot(p.id) + 1);
        _rejectQueue(p, IGovernor.ProposalState.Active);
    }

    function testCannotQueueDefeated() public {
        Payment memory p = _create(REQUEST, recipient, 1_000 ether, "Defeated queue");
        vm.warp(governor.proposalDeadline(p.id) + 1);
        _rejectQueue(p, IGovernor.ProposalState.Defeated);
    }

    function testCannotQueueCanceled() public {
        Payment memory p = _create(REQUEST, recipient, 1_000 ether, "Canceled queue");
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _actions(p);
        vm.prank(a);
        governor.cancel(targets, values, data, p.descriptionHash);
        _rejectQueue(p, IGovernor.ProposalState.Canceled);
    }

    function testQueueByNonHolderEmitsBatchOperationAndETA() public {
        Payment memory p = _create(REQUEST, recipient, 1_000 ether, "Queue events");
        _succeed(p);
        assertEq(bud.balanceOf(address(treasury)), 10_000 ether);
        assertEq(gov.balanceOf(queueUser), 0);
        assertEq(gov.getVotes(queueUser), 0);
        uint256 queuedAt = block.timestamp;
        vm.expectEmit(true, true, false, true, address(timelock));
        emit TimelockController.CallScheduled(p.operation, 0, address(treasury), 0, p.payload, bytes32(0), 120);
        vm.expectEmit(true, false, false, true, address(timelock));
        emit TimelockController.CallSalt(p.operation, bytes32(bytes20(address(governor))) ^ p.descriptionHash);
        vm.expectEmit(false, false, false, true, address(governor));
        emit IGovernor.ProposalQueued(p.id, queuedAt + 120);
        _queue(p);
        _state(p, IGovernor.ProposalState.Queued);
        assertEq(p.eta, queuedAt + 120);
        assertEq(timelock.getTimestamp(p.operation), p.eta);
        assertTrue(timelock.isOperationPending(p.operation));
        assertFalse(timelock.isOperationReady(p.operation));
        assertFalse(timelock.isOperationDone(p.operation));
        _assertUnpaid(p, 10_000 ether);
    }

    function testQueuedProposalCannotQueueAgain() public {
        Payment memory p = _queued();
        uint256 eta = p.eta;
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _actions(p);
        vm.expectRevert(
            abi.encodeWithSelector(
                IGovernor.GovernorUnexpectedProposalState.selector,
                p.id,
                IGovernor.ProposalState.Queued,
                bytes32(uint256(1) << uint8(IGovernor.ProposalState.Succeeded))
            )
        );
        vm.prank(queueUser);
        governor.queue(targets, values, data, p.descriptionHash);
        assertEq(governor.proposalEta(p.id), eta);
        assertEq(timelock.getTimestamp(p.operation), eta);
        _assertUnpaid(p, 10_000 ether);
    }

    function _tooEarly(bool lastSecond) internal {
        Payment memory p = _queued();
        if (lastSecond) vm.warp(p.eta - 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                TimelockController.TimelockUnexpectedOperationState.selector,
                p.operation,
                bytes32(uint256(1) << uint8(TimelockController.OperationState.Ready))
            )
        );
        _execute(p);
        _state(p, IGovernor.ProposalState.Queued);
        _assertUnpaid(p, 10_000 ether);
        assertFalse(timelock.isOperationDone(p.operation));
        assertEq(timelock.getTimestamp(p.operation), p.eta);
    }

    function testExecuteImmediatelyAfterQueueReverts() public {
        _tooEarly(false);
    }

    function testExecuteAtETAminusOneReverts() public {
        _tooEarly(true);
    }

    function _successAt(uint256 offset) internal {
        Payment memory p = _queued();
        vm.warp(p.eta + offset);
        assertTrue(timelock.isOperationReady(p.operation));
        _state(p, IGovernor.ProposalState.Queued);
        assertEq(gov.balanceOf(executeUser), 0);
        assertEq(gov.getVotes(executeUser), 0);
        (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes) = governor.proposalVotes(p.id);
        assertEq(forVotes, 700 ether);
        assertEq(againstVotes, 0);
        assertEq(abstainVotes, 0);
        assertEq(governor.quorum(governor.proposalSnapshot(p.id)), 200 ether);
        vm.expectEmit(true, true, false, true, address(treasury));
        emit ITreasury.BudgetDisbursed(p.request, p.to, p.amount);
        vm.expectEmit(true, true, false, true, address(timelock));
        emit TimelockController.CallExecuted(p.operation, 0, address(treasury), 0, p.payload);
        vm.expectEmit(false, false, false, true, address(governor));
        emit IGovernor.ProposalExecuted(p.id);
        _execute(p);
        _state(p, IGovernor.ProposalState.Executed);
        assertTrue(timelock.isOperationDone(p.operation));
        assertFalse(timelock.isOperationReady(p.operation));
        assertTrue(treasury.paidRequests(p.request));
        assertEq(bud.balanceOf(address(treasury)), 9_000 ether);
        assertEq(bud.balanceOf(recipient), 1_000 ether);
        assertEq(bud.totalSupply(), 20_000 ether);
        _assertFinalRoles();
    }

    function testTC01ExecuteExactlyAtETAByNonHolder() public {
        _successAt(0);
    }

    function testExecuteAtETAplusOneByNonHolder() public {
        _successAt(1);
    }

    function testExecuteCannotRepeatAfterDone() public {
        Payment memory p = _queued();
        vm.warp(p.eta);
        _execute(p);
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _actions(p);
        vm.expectRevert(
            abi.encodeWithSelector(
                IGovernor.GovernorUnexpectedProposalState.selector,
                p.id,
                IGovernor.ProposalState.Executed,
                bytes32(
                    (uint256(1) << uint8(IGovernor.ProposalState.Succeeded))
                        | (uint256(1) << uint8(IGovernor.ProposalState.Queued))
                )
            )
        );
        vm.prank(executeUser);
        governor.execute(targets, values, data, p.descriptionHash);
        _state(p, IGovernor.ProposalState.Executed);
        assertTrue(timelock.isOperationDone(p.operation));
        assertEq(bud.balanceOf(address(treasury)), 9_000 ether);
        assertEq(bud.balanceOf(recipient), 1_000 ether);
    }

    function testInsufficientBudgetRetriesSameReadyOperation() public {
        Payment memory p = _create(REQUEST, recipient, 11_000 ether, "Insufficient budget retry");
        _succeed(p);
        _queue(p);
        vm.warp(p.eta);
        vm.expectRevert(abi.encodeWithSelector(Treasury.InsufficientBudget.selector, 10_000 ether, 11_000 ether));
        _execute(p);
        _state(p, IGovernor.ProposalState.Queued);
        _assertUnpaid(p, 10_000 ether);
        assertTrue(timelock.isOperationReady(p.operation));
        assertFalse(timelock.isOperationDone(p.operation));
        assertEq(timelock.getTimestamp(p.operation), p.eta);
        assertEq(governor.proposalEta(p.id), p.eta);
        vm.prank(funding);
        bud.transfer(address(treasury), 1_000 ether);
        _execute(p);
        _state(p, IGovernor.ProposalState.Executed);
        assertTrue(timelock.isOperationDone(p.operation));
        assertTrue(treasury.paidRequests(REQUEST));
        assertEq(bud.balanceOf(address(treasury)), 0);
        assertEq(bud.balanceOf(recipient), 11_000 ether);
        assertEq(bud.balanceOf(funding), 9_000 ether);
    }

    function _approveBoth(Payment memory first, Payment memory second) internal {
        vm.warp(governor.proposalSnapshot(first.id) + 1);
        _vote(first);
        _vote(second);
        vm.warp(governor.proposalDeadline(first.id) + 1);
        _queue(first);
        _queue(second);
        vm.warp(first.eta);
    }

    function testTwoDistinctProposalsWithSameRequestPayOnce() public {
        Payment memory first = _create(REQUEST, recipient, 1_000 ether, "First shared request");
        Payment memory second = _create(REQUEST, otherRecipient, 2_000 ether, "Second shared request");
        assertTrue(first.id != second.id);
        assertTrue(first.operation != second.operation);
        _approveBoth(first, second);
        _execute(first);
        vm.expectRevert(abi.encodeWithSelector(Treasury.RequestAlreadyPaid.selector, REQUEST));
        _execute(second);
        _state(first, IGovernor.ProposalState.Executed);
        _state(second, IGovernor.ProposalState.Queued);
        assertTrue(timelock.isOperationDone(first.operation));
        assertTrue(timelock.isOperationReady(second.operation));
        assertFalse(timelock.isOperationDone(second.operation));
        assertTrue(treasury.paidRequests(REQUEST));
        assertEq(bud.balanceOf(address(treasury)), 9_000 ether);
        assertEq(bud.balanceOf(recipient), 1_000 ether);
        assertEq(bud.balanceOf(otherRecipient), 0);
    }

    function testConcurrentProposalsDoNotReserveBudgetAndRetryAfterTopup() public {
        bytes32 secondRequest = keccak256("SC05-second-request");
        Payment memory first = _create(REQUEST, recipient, 7_000 ether, "First competing payment");
        Payment memory second = _create(secondRequest, otherRecipient, 6_000 ether, "Second competing payment");
        _approveBoth(first, second);
        _assertUnpaid(first, 10_000 ether);
        _assertUnpaid(second, 10_000 ether);
        _execute(first);
        vm.expectRevert(abi.encodeWithSelector(Treasury.InsufficientBudget.selector, 3_000 ether, 6_000 ether));
        _execute(second);
        _state(second, IGovernor.ProposalState.Queued);
        assertTrue(timelock.isOperationReady(second.operation));
        _assertUnpaid(second, 3_000 ether);
        assertEq(bud.balanceOf(recipient), 7_000 ether);
        vm.prank(funding);
        bud.transfer(address(treasury), 3_000 ether);
        _execute(second);
        _state(second, IGovernor.ProposalState.Executed);
        assertTrue(timelock.isOperationDone(second.operation));
        assertTrue(treasury.paidRequests(REQUEST));
        assertTrue(treasury.paidRequests(secondRequest));
        assertEq(bud.balanceOf(address(treasury)), 0);
        assertEq(bud.balanceOf(recipient), 7_000 ether);
        assertEq(bud.balanceOf(otherRecipient), 6_000 ether);
        assertEq(bud.balanceOf(funding), 7_000 ether);
        assertEq(bud.totalSupply(), 20_000 ether);
    }

    function testFuzzFormerBootstrapAndUsersCannotChangeRoles(uint8 actorIndex, uint8 roleIndex, bool grant) public {
        address[4] memory actors = [deployer, temporary, queueUser, executeUser];
        address caller = actors[bound(actorIndex, 0, 3)];
        bytes32[3] memory roles = [PROPOSER, EXECUTOR, CANCELLER];
        bytes32 role = roles[bound(roleIndex, 0, 2)];
        _denied(caller, ADMIN);
        vm.prank(caller);
        if (grant) timelock.grantRole(role, caller);
        else timelock.revokeRole(role, address(governor));
        _assertFinalRoles();
    }

    function testFormerBootstrapCannotRegrantTreasuryRoles() public {
        address[2] memory former = [deployer, temporary];
        for (uint256 i; i < former.length; ++i) {
            _denied(former[i], ADMIN);
            vm.prank(former[i]);
            treasury.grantRole(SPENDER, former[i]);
            _denied(former[i], ADMIN);
            vm.prank(former[i]);
            treasury.grantRole(ADMIN, former[i]);
            _denied(former[i], ADMIN);
            vm.prank(former[i]);
            treasury.revokeRole(SPENDER, address(timelock));
        }
        _assertFinalRoles();
    }

    function testUsersAndFormerBootstrapCannotDisburseTreasury() public {
        address[5] memory callers = [queueUser, executeUser, deployer, temporary, address(governor)];
        for (uint256 i; i < callers.length; ++i) {
            _denied(callers[i], SPENDER);
            vm.prank(callers[i]);
            treasury.disburse(REQUEST, recipient, 1_000 ether);
        }
        assertEq(bud.balanceOf(address(treasury)), 10_000 ether);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testUserCannotScheduleSingleOrBatchDirectly() public {
        Payment memory p = _create(REQUEST, recipient, 1_000 ether, "Unauthorized scheduling");
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _actions(p);
        _denied(queueUser, PROPOSER);
        vm.prank(queueUser);
        timelock.schedule(address(treasury), 0, p.payload, 0, 0, 120);
        _denied(queueUser, PROPOSER);
        vm.prank(queueUser);
        timelock.scheduleBatch(targets, values, data, 0, 0, 120);
        _state(p, IGovernor.ProposalState.Pending);
        assertFalse(timelock.isOperation(p.operation));
        _assertUnpaid(p, 10_000 ether);
    }

    function testUserCannotExecuteReadyOperationDirectlySingleOrBatch() public {
        Payment memory p = _queued();
        vm.warp(p.eta);
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _actions(p);
        _denied(executeUser, EXECUTOR);
        vm.prank(executeUser);
        timelock.execute(address(treasury), 0, p.payload, 0, 0);
        _denied(executeUser, EXECUTOR);
        vm.prank(executeUser);
        timelock.executeBatch(targets, values, data, 0, bytes32(bytes20(address(governor))) ^ p.descriptionHash);
        _state(p, IGovernor.ProposalState.Queued);
        assertTrue(timelock.isOperationReady(p.operation));
        _assertUnpaid(p, 10_000 ether);
        _execute(p);
        assertTrue(timelock.isOperationDone(p.operation));
    }

    function testUserAndFormerBootstrapCannotCancelTimelockOperation() public {
        Payment memory p = _queued();
        address[3] memory callers = [queueUser, deployer, temporary];
        for (uint256 i; i < callers.length; ++i) {
            _denied(callers[i], CANCELLER);
            vm.prank(callers[i]);
            timelock.cancel(p.operation);
        }
        assertEq(timelock.getTimestamp(p.operation), p.eta);
        _state(p, IGovernor.ProposalState.Queued);
        _assertUnpaid(p, 10_000 ether);
    }

    function testFormerBootstrapCannotScheduleOrExecuteReadyBatch() public {
        Payment memory p = _queued();
        vm.warp(p.eta);
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _actions(p);
        address[2] memory former = [deployer, temporary];
        for (uint256 i; i < former.length; ++i) {
            _denied(former[i], PROPOSER);
            vm.prank(former[i]);
            timelock.scheduleBatch(targets, values, data, 0, bytes32(0), 120);
            _denied(former[i], EXECUTOR);
            vm.prank(former[i]);
            timelock.executeBatch(targets, values, data, 0, bytes32(bytes20(address(governor))) ^ p.descriptionHash);
        }
        assertTrue(timelock.isOperationReady(p.operation));
        _assertUnpaid(p, 10_000 ether);
    }

    function testFormerBootstrapCannotChangeDelayOrRenounceOthers() public {
        address[3] memory callers = [deployer, temporary, queueUser];
        for (uint256 i; i < callers.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(TimelockController.TimelockUnauthorizedCaller.selector, callers[i]));
            vm.prank(callers[i]);
            timelock.updateDelay(0);
            vm.expectRevert(IAccessControl.AccessControlBadConfirmation.selector);
            vm.prank(callers[i]);
            timelock.renounceRole(PROPOSER, address(governor));
        }
        _assertFinalRoles();
    }

    function testRelayCannotBypassRolesAfterFinalBootstrap() public {
        Payment memory p = _create(REQUEST, recipient, 1_000 ether, "Unauthorized relay");
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorOnlyExecutor.selector, deployer));
        vm.prank(deployer);
        governor.relay(address(treasury), 0, p.payload);
        _assertUnpaid(p, 10_000 ether);
        _assertFinalRoles();
    }

    function testRoleChangingProposalRejectedAfterFinalBootstrap() public {
        Payment memory p = _create(REQUEST, recipient, 1_000 ether, "Role whitelist bypass");
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _actions(p);
        data[0] = abi.encodeCall(treasury.grantRole, (SPENDER, queueUser));
        vm.expectRevert(BudgetGovernor.InvalidCalldata.selector);
        vm.prank(a);
        governor.propose(targets, values, data, "role bypass");
        _assertUnpaid(p, 10_000 ether);
        _assertFinalRoles();
    }

    function testFuzzExecuteTamperingDoesNotConsumeReadyOperation(uint8 field) public {
        Payment memory p = _queued();
        vm.warp(p.eta);
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _actions(p);
        bytes32 hash = p.descriptionHash;
        uint256 f = bound(field, 0, 2);
        if (f == 0) data[0] = abi.encodeCall(ITreasury.disburse, (p.request, otherRecipient, p.amount));
        if (f == 1) data[0] = abi.encodeCall(ITreasury.disburse, (p.request, p.to, p.amount + 1));
        if (f == 2) hash = keccak256("tampered description");
        uint256 altered = governor.hashProposal(targets, values, data, hash);
        vm.expectRevert(abi.encodeWithSelector(IGovernor.GovernorNonexistentProposal.selector, altered));
        vm.prank(executeUser);
        governor.execute(targets, values, data, hash);
        _state(p, IGovernor.ProposalState.Queued);
        assertTrue(timelock.isOperationReady(p.operation));
        _assertUnpaid(p, 10_000 ether);
    }

    function testGovernorUsesBatchOperationNotSingleCallHash() public {
        Payment memory p = _queued();
        bytes32 salt = bytes32(bytes20(address(governor))) ^ p.descriptionHash;
        bytes32 single = timelock.hashOperation(address(treasury), 0, p.payload, bytes32(0), salt);
        assertTrue(single != p.operation);
        assertFalse(timelock.isOperation(single));
        assertTrue(timelock.isOperationPending(p.operation));
        assertEq(timelock.getTimestamp(p.operation), governor.proposalEta(p.id));
        _assertUnpaid(p, 10_000 ether);
    }
}
