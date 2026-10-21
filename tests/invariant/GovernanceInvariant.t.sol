// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {BudgetGovernor} from "../../contracts/BudgetGovernor.sol";
import {GovernanceToken} from "../../contracts/GovernanceToken.sol";
import {BudgetToken} from "../../contracts/BudgetToken.sol";
import {Treasury} from "../../contracts/Treasury.sol";
import {ITreasury} from "../../contracts/interfaces/ITreasury.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @dev Bounded local model: five EOA voters, four passive BUD recipients, 16
/// requests and at most 24 proposals. No minting, storage writes, privileged
/// impersonation, external tokens, signatures, reorgs, indexer or UI assumptions.
/// Token balances/delegates and timestamp checkpoints are ghost state, NOT read
/// from GOV. Payment predictions never consult Treasury.paidRequests/balance.
contract GovernanceOracleHandler is Test {
    uint256 public constant ACTOR_COUNT = 5;
    uint256 public constant RECIPIENT_COUNT = 4;
    uint256 public constant REQUEST_COUNT = 16;
    uint256 public constant MAX_PROPOSALS = 24;
    uint256 public constant SUPPLY = 1_000 ether;
    uint256 public constant QUORUM = 200 ether;

    enum CallKind {
        Propose,
        Vote,
        Queue,
        Execute,
        Cancel,
        Fund,
        Transfer,
        Delegate,
        Unauthorized,
        Tamper
    }

    struct Proposal {
        uint256 id;
        uint256 request;
        uint256 recipientIndex;
        uint256 amount;
        uint256 proposerIndex;
        uint256 snapshot;
        uint256 deadline;
        uint256 eta;
        uint256 queuedAt;
        uint256 executedAt;
        bytes32 descriptionHash;
        bytes32 operation;
        uint256[5] weights;
        uint256[3] tallies;
        uint256 votedMask;
        bool pinned;
        bool canceled;
        bool executed;
        bool validExecution;
    }

    struct Checkpoint {
        uint256 timestamp;
        uint256[5] weights;
    }

    GovernanceToken public immutable gov;
    BudgetToken public immutable bud;
    Treasury public immutable treasury;
    TimelockController public immutable timelock;
    BudgetGovernor public immutable governor;
    Proposal[] internal proposals;
    Checkpoint[] internal checkpoints;
    uint256[5] public balances;
    uint256[5] public delegates; // ACTOR_COUNT denotes undelegated/address(0).
    uint256[16] public paymentsByRequest;
    uint256[4] public received;
    uint256[10] public attempts;
    uint256[10] public successes;
    uint256[10] public reverts;
    uint256 public totalFunded;
    uint256 public totalPaid;
    uint256 public successfulExecutions;
    uint256 public spontaneousExecutions;
    uint256 public reachableExecutions;
    uint256 public reachableCalls;
    uint256 public sequenceCalls;
    uint256 public unauthorizedSuccesses;
    bool public unexpectedOutcome;

    constructor() {
        // Bootstrap is a real EOA, distinct from the handler and every voter.
        vm.startPrank(bootstrap());
        gov = new GovernanceToken(actor(0), actor(1), actor(2), actor(3));
        bud = new BudgetToken(funding());
        treasury = new Treasury(address(bud), bootstrap());
        timelock = new TimelockController(120, new address[](0), new address[](0), bootstrap());
        governor = new BudgetGovernor(address(gov), address(treasury), address(timelock));
        treasury.grantRole(treasury.DEFAULT_ADMIN_ROLE(), address(timelock));
        treasury.grantRole(treasury.SPENDER_ROLE(), address(timelock));
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
        treasury.renounceRole(treasury.DEFAULT_ADMIN_ROLE(), bootstrap());
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), bootstrap());
        vm.stopPrank();

        // Authority is already final BEFORE the first BUD funding transaction.
        _fund(10_000 ether);
        balances[0] = 400 ether;
        balances[1] = 300 ether;
        balances[2] = 200 ether;
        balances[3] = 100 ether;
        for (uint256 i; i < ACTOR_COUNT; ++i) {
            delegates[i] = i;
            vm.prank(actor(i));
            gov.delegate(actor(i));
        }
        _checkpoint();
        _advance(block.timestamp + 1);
    }

    function actor(uint256 i) public pure returns (address) {
        return address(uint160(0xA400 + i % ACTOR_COUNT));
    }

    function recipient(uint256 i) public pure returns (address) {
        return address(uint160(0xB400 + i % RECIPIENT_COUNT));
    }

    function bootstrap() public pure returns (address) {
        return address(0xC401);
    }

    function funding() public pure returns (address) {
        return address(0xC402);
    }

    function proposalCount() public view returns (uint256) {
        return proposals.length;
    }

    function proposal(uint256 i) public view returns (Proposal memory) {
        return proposals[i];
    }

    function requestId(uint256 i) public pure returns (bytes32) {
        return bytes32(i % REQUEST_COUNT);
    }

    function currentWeights() public view returns (uint256[5] memory weights) {
        for (uint256 i; i < ACTOR_COUNT; ++i) {
            if (delegates[i] < ACTOR_COUNT) weights[delegates[i]] += balances[i];
        }
    }

    function expectedState(uint256 i) public view returns (IGovernor.ProposalState) {
        Proposal storage p = proposals[i];
        if (p.executed) return IGovernor.ProposalState.Executed;
        if (p.canceled) return IGovernor.ProposalState.Canceled;
        if (block.timestamp <= p.snapshot) return IGovernor.ProposalState.Pending;
        if (block.timestamp <= p.deadline) return IGovernor.ProposalState.Active;
        if (p.tallies[1] + p.tallies[2] < QUORUM || p.tallies[1] <= p.tallies[0]) {
            return IGovernor.ProposalState.Defeated;
        }
        return p.eta == 0 ? IGovernor.ProposalState.Succeeded : IGovernor.ProposalState.Queued;
    }

    // Every selectable action starts the sequence with an actual full lifecycle.
    // This is NOT a payment seeded in setUp: it runs inside the fuzz sequence and
    // its counters/state disappear on reset. Other calls interleave freely.
    function _begin() internal {
        sequenceCalls++;
        if (sequenceCalls == 1) _reachable(0);
    }

    function lifecycle(uint256 seed) external {
        _begin();
        _reachable(seed);
    }

    function propose(uint256 proposerSeed, uint256 requestSeed, uint256 recipientSeed, uint256 amountSeed) external {
        _begin();
        _propose(
            proposerSeed % ACTOR_COUNT,
            requestSeed % REQUEST_COUNT,
            recipientSeed % RECIPIENT_COUNT,
            bound(amountSeed, 1, 15_000 ether)
        );
    }

    function vote(uint256 proposalSeed, uint256 voterSeed, uint256 supportSeed) external {
        _begin();
        if (proposals.length == 0) return; // Preserve a sticky failed initial lifecycle.
        _vote(proposalSeed % proposals.length, voterSeed % ACTOR_COUNT, uint8(supportSeed % 4));
    }

    function advance(uint256 secondsSeed) external {
        _begin();
        _advance(block.timestamp + bound(secondsSeed, 0, 600));
    }

    function queue(uint256 proposalSeed) external {
        _begin();
        if (proposals.length != 0) _queue(proposalSeed % proposals.length);
    }

    function execute(uint256 proposalSeed) external {
        _begin();
        if (proposals.length != 0) _execute(proposalSeed % proposals.length, false);
    }

    function cancel(uint256 proposalSeed, uint256 callerSeed) external {
        _begin();
        if (proposals.length == 0) return;
        uint256 i = proposalSeed % proposals.length;
        uint256 callerIndex = callerSeed % ACTOR_COUNT;
        Proposal storage p = proposals[i];
        bool expected = expectedState(i) == IGovernor.ProposalState.Pending && callerIndex == p.proposerIndex;
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _action(p);
        (bool ok, bytes memory result) = _call(
            CallKind.Cancel,
            actor(callerIndex),
            address(governor),
            abi.encodeCall(governor.cancel, (targets, values, data, p.descriptionHash)),
            expected
        );
        if (ok) {
            p.canceled = true;
            _checkReturn(result, p.id);
        }
    }

    function fund(uint256 amountSeed) external {
        _begin();
        _fund(bound(amountSeed, 0, 20_000 ether - totalFunded));
    }

    function transferGov(uint256 fromSeed, uint256 toSeed, uint256 amountSeed) external {
        _begin();
        uint256 from = fromSeed % ACTOR_COUNT;
        uint256 to = toSeed % ACTOR_COUNT;
        uint256 amount = bound(amountSeed, 0, balances[from]);
        (bool ok, bytes memory result) =
            _call(CallKind.Transfer, actor(from), address(gov), abi.encodeCall(gov.transfer, (actor(to), amount)), true);
        if (ok) {
            _checkReturn(result, 1);
            balances[from] -= amount;
            balances[to] += amount;
            _checkpoint();
        }
    }

    function delegateGov(uint256 fromSeed, uint256 toSeed) external {
        _begin();
        _delegate(fromSeed % ACTOR_COUNT, toSeed % (ACTOR_COUNT + 1));
    }

    /// @dev Former bootstrap as well as voters attack the FINAL role graph.
    /// Direct execute/cancel uses a genuine existing operation, not an invented ID.
    function unauthorized(uint256 kindSeed, uint256 callerSeed, uint256 proposalSeed) external {
        _begin();
        if (proposals.length == 0) return;
        Proposal storage p = proposals[proposalSeed % proposals.length];
        address caller = callerSeed % 2 == 0 ? bootstrap() : actor(callerSeed % ACTOR_COUNT);
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _action(p);
        bytes32 salt = bytes32(bytes20(address(governor))) ^ p.descriptionHash;
        uint256 kind = kindSeed % 10;
        address target = address(timelock);
        bytes memory payload;
        if (kind == 0) {
            target = address(treasury);
            payload = data[0];
        }
        if (kind == 1) {
            payload = abi.encodeCall(timelock.scheduleBatch, (targets, values, data, bytes32(0), salt, 120));
        }
        if (kind == 2) payload = abi.encodeCall(timelock.executeBatch, (targets, values, data, bytes32(0), salt));
        if (kind == 3) payload = abi.encodeCall(timelock.cancel, (p.operation));
        if (kind == 4) payload = abi.encodeCall(timelock.grantRole, (timelock.PROPOSER_ROLE(), caller));
        if (kind == 5) payload = abi.encodeCall(timelock.grantRole, (timelock.EXECUTOR_ROLE(), address(0)));
        if (kind == 6) payload = abi.encodeCall(timelock.updateDelay, (uint256(0)));
        if (kind == 7) {
            target = address(treasury);
            payload = abi.encodeCall(treasury.grantRole, (treasury.SPENDER_ROLE(), caller));
        }
        if (kind == 8) {
            target = address(treasury);
            payload = abi.encodeCall(treasury.grantRole, (treasury.DEFAULT_ADMIN_ROLE(), caller));
        }
        if (kind == 9) {
            target = address(governor);
            payload = abi.encodeCall(governor.setVotingPeriod, (uint32(1)));
        }
        (bool ok,) = _call(CallKind.Unauthorized, caller, target, payload, false);
        if (ok) unauthorizedSuccesses++;
    }

    function tamper(uint256 proposalSeed, uint256 kindSeed) external {
        _begin();
        if (proposals.length == 0) return;
        Proposal storage p = proposals[proposalSeed % proposals.length];
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _action(p);
        // A new description hash is never used by the bounded proposal universe.
        bytes32 alteredHash = keccak256(abi.encode("not-created", p.descriptionHash));
        bytes memory payload = kindSeed % 2 == 0
            ? abi.encodeCall(governor.queue, (targets, values, data, alteredHash))
            : abi.encodeCall(governor.execute, (targets, values, data, alteredHash));
        _call(CallKind.Tamper, actor(4), address(governor), payload, false);
    }

    function _call(CallKind kind, address caller, address target, bytes memory payload, bool expected)
        internal
        returns (bool ok, bytes memory result)
    {
        attempts[uint256(kind)]++;
        vm.prank(caller);
        (ok, result) = target.call(payload);
        if (ok) successes[uint256(kind)]++;
        else reverts[uint256(kind)]++;
        // No assert/expectRevert inside a handler action: a discarded handler
        // revert cannot hide the sticky mismatch under fail_on_revert=false.
        if (ok != expected) unexpectedOutcome = true;
    }

    function _checkReturn(bytes memory result, uint256 expected) internal {
        if (result.length != 32) {
            unexpectedOutcome = true;
            return;
        }
        if (abi.decode(result, (uint256)) != expected) unexpectedOutcome = true;
    }

    function _checkpoint() internal {
        uint256[5] memory weights = currentWeights();
        if (checkpoints.length != 0 && checkpoints[checkpoints.length - 1].timestamp == block.timestamp) {
            checkpoints[checkpoints.length - 1].weights = weights;
        } else {
            checkpoints.push(Checkpoint({timestamp: block.timestamp, weights: weights}));
        }
    }

    function _weightsAt(uint256 timestamp) internal view returns (uint256[5] memory weights) {
        for (uint256 i = checkpoints.length; i != 0; --i) {
            if (checkpoints[i - 1].timestamp <= timestamp) return checkpoints[i - 1].weights;
        }
    }

    function _advance(uint256 timestamp) internal {
        if (timestamp > block.timestamp) vm.warp(timestamp);
        for (uint256 i; i < proposals.length; ++i) {
            Proposal storage p = proposals[i];
            if (!p.pinned && p.snapshot < block.timestamp) {
                p.weights = _weightsAt(p.snapshot);
                p.pinned = true;
            }
        }
    }

    function _delegate(uint256 from, uint256 to) internal {
        address delegatee = to == ACTOR_COUNT ? address(0) : actor(to);
        (bool ok,) =
            _call(CallKind.Delegate, actor(from), address(gov), abi.encodeCall(gov.delegate, (delegatee)), true);
        if (ok) {
            delegates[from] = to;
            _checkpoint();
        }
    }

    function _fund(uint256 amount) internal {
        (bool ok, bytes memory result) = _call(
            CallKind.Fund, funding(), address(bud), abi.encodeCall(bud.transfer, (address(treasury), amount)), true
        );
        if (ok) {
            _checkReturn(result, 1);
            totalFunded += amount;
        }
    }

    function _action(Proposal storage p)
        internal
        view
        returns (address[] memory targets, uint256[] memory values, bytes[] memory data)
    {
        targets = new address[](1);
        targets[0] = address(treasury);
        values = new uint256[](1);
        data = new bytes[](1);
        data[0] = abi.encodeCall(ITreasury.disburse, (requestId(p.request), recipient(p.recipientIndex), p.amount));
    }

    function _propose(uint256 proposerIndex, uint256 request, uint256 recipientIndex, uint256 amount)
        internal
        returns (bool created, uint256 index)
    {
        if (proposals.length >= MAX_PROPOSALS) return (false, 0);
        index = proposals.length;
        string memory description = string.concat("tv4-stateful-proposal-", vm.toString(index));
        address[] memory targets = new address[](1);
        targets[0] = address(treasury);
        uint256[] memory values = new uint256[](1);
        bytes[] memory data = new bytes[](1);
        data[0] = abi.encodeCall(ITreasury.disburse, (requestId(request), recipient(recipientIndex), amount));
        bytes memory result;
        (created, result) = _call(
            CallKind.Propose,
            actor(proposerIndex),
            address(governor),
            abi.encodeCall(governor.propose, (targets, values, data, description)),
            _weightsAt(block.timestamp - 1)[proposerIndex] >= 50 ether
        );
        if (!created) return (false, index);
        proposals.push();
        Proposal storage p = proposals[index];
        p.descriptionHash = keccak256(bytes(description));
        p.id = uint256(keccak256(abi.encode(targets, values, data, p.descriptionHash)));
        _checkReturn(result, p.id);
        p.request = request;
        p.recipientIndex = recipientIndex;
        p.amount = amount;
        p.proposerIndex = proposerIndex;
        p.snapshot = block.timestamp + 60;
        p.deadline = block.timestamp + 360;
        p.operation = keccak256(
            abi.encode(targets, values, data, bytes32(0), bytes32(bytes20(address(governor))) ^ p.descriptionHash)
        );
    }

    function _vote(uint256 index, uint256 voter, uint8 support) internal {
        Proposal storage p = proposals[index];
        bool expected =
            expectedState(index) == IGovernor.ProposalState.Active && (p.votedMask & (1 << voter)) == 0 && support < 3;
        (bool ok, bytes memory result) = _call(
            CallKind.Vote, actor(voter), address(governor), abi.encodeCall(governor.castVote, (p.id, support)), expected
        );
        if (ok) {
            _checkReturn(result, p.weights[voter]);
            p.votedMask |= 1 << voter;
            if (support < 3) p.tallies[support] += p.weights[voter];
        }
    }

    function _queue(uint256 index) internal {
        Proposal storage p = proposals[index];
        bool expected = expectedState(index) == IGovernor.ProposalState.Succeeded;
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _action(p);
        (bool ok, bytes memory result) = _call(
            CallKind.Queue,
            actor(4),
            address(governor),
            abi.encodeCall(governor.queue, (targets, values, data, p.descriptionHash)),
            expected
        );
        if (ok) {
            _checkReturn(result, p.id);
            p.queuedAt = block.timestamp;
            p.eta = block.timestamp + 120;
        }
    }

    function _execute(uint256 index, bool reachable) internal {
        Proposal storage p = proposals[index];
        bool validPath = expectedState(index) == IGovernor.ProposalState.Queued && p.eta != 0
            && block.timestamp >= p.eta && p.queuedAt > p.deadline && p.tallies[1] + p.tallies[2] >= QUORUM
            && p.tallies[1] > p.tallies[0];
        bool expected = validPath && paymentsByRequest[p.request] == 0 && totalPaid <= totalFunded
            && p.amount <= totalFunded - totalPaid;
        (address[] memory targets, uint256[] memory values, bytes[] memory data) = _action(p);
        vm.recordLogs();
        (bool ok, bytes memory result) = _call(
            CallKind.Execute,
            actor(4),
            address(governor),
            abi.encodeCall(governor.execute, (targets, values, data, p.descriptionHash)),
            expected
        );
        Vm.Log[] memory entries = vm.getRecordedLogs();
        if (!ok) return;
        _checkReturn(result, p.id);
        _checkPaymentEvents(p, entries, data[0]);
        p.executed = true;
        p.executedAt = block.timestamp;
        p.validExecution = validPath;
        // Record the observed committed result even if it violated prediction.
        // In particular, never condition this ghost history on paidRequests.
        paymentsByRequest[p.request]++;
        received[p.recipientIndex] += p.amount;
        totalPaid += p.amount;
        successfulExecutions++;
        if (reachable) reachableExecutions++;
        else spontaneousExecutions++;
    }

    function _checkPaymentEvents(Proposal storage p, Vm.Log[] memory entries, bytes memory payload) internal {
        uint256 transfers;
        uint256 disbursements;
        uint256 timelockCalls;
        for (uint256 i; i < entries.length; ++i) {
            Vm.Log memory entry = entries[i];
            if (entry.topics.length == 0) continue;
            if (entry.emitter == address(bud) && entry.topics[0] == keccak256("Transfer(address,address,uint256)")) {
                transfers++;
                if (entry.topics.length != 3 || entry.data.length != 32) {
                    unexpectedOutcome = true;
                    continue;
                }
                if (
                    entry.topics[1] != bytes32(uint256(uint160(address(treasury))))
                        || entry.topics[2] != bytes32(uint256(uint160(recipient(p.recipientIndex))))
                        || abi.decode(entry.data, (uint256)) != p.amount
                ) unexpectedOutcome = true;
            }
            if (
                entry.emitter == address(treasury)
                    && entry.topics[0] == keccak256("BudgetDisbursed(bytes32,address,uint256)")
            ) {
                disbursements++;
                if (entry.topics.length != 3 || entry.data.length != 32) {
                    unexpectedOutcome = true;
                    continue;
                }
                if (
                    entry.topics[1] != requestId(p.request)
                        || entry.topics[2] != bytes32(uint256(uint160(recipient(p.recipientIndex))))
                        || abi.decode(entry.data, (uint256)) != p.amount
                ) unexpectedOutcome = true;
            }
            if (
                entry.emitter == address(timelock)
                    && entry.topics[0] == keccak256("CallExecuted(bytes32,uint256,address,uint256,bytes)")
            ) {
                timelockCalls++;
                if (
                    entry.topics.length != 3 || entry.topics[1] != p.operation || entry.topics[2] != bytes32(0)
                        || keccak256(entry.data) != keccak256(abi.encode(address(treasury), uint256(0), payload))
                ) {
                    unexpectedOutcome = true;
                }
            }
        }
        if (transfers != 1 || disbursements != 1 || timelockCalls != 1) unexpectedOutcome = true;
    }

    function _reachable(uint256 seed) internal {
        reachableCalls++;
        if (proposals.length >= MAX_PROPOSALS) return;
        uint256 request = REQUEST_COUNT;
        for (uint256 i; i < REQUEST_COUNT; ++i) {
            uint256 candidate = (seed % REQUEST_COUNT + i) % REQUEST_COUNT;
            if (paymentsByRequest[candidate] == 0) {
                request = candidate;
                break;
            }
        }
        if (request == REQUEST_COUNT) return;
        // EOA delegation, not fabricated voting state. Consolidation/transfer is
        // unnecessary: one of five holders necessarily owns >=200 of 1000 GOV.
        for (uint256 i; i < ACTOR_COUNT; ++i) {
            _delegate(i, i);
        }
        _advance(block.timestamp + 1);
        uint256 proposerIndex;
        for (uint256 i = 1; i < ACTOR_COUNT; ++i) {
            if (balances[i] > balances[proposerIndex]) proposerIndex = i;
        }
        (bool created, uint256 index) = _propose(proposerIndex, request, seed % RECIPIENT_COUNT, 1 ether);
        if (!created) return;
        _advance(proposals[index].snapshot + 1);
        for (uint256 i; i < ACTOR_COUNT; ++i) {
            _vote(index, i, 1);
        }
        _advance(proposals[index].deadline + 1);
        _queue(index);
        _advance(proposals[index].eta);
        if (totalPaid <= totalFunded && totalFunded - totalPaid < 1 ether && totalFunded < 20_000 ether) {
            uint256 shortfall = 1 ether - (totalFunded - totalPaid);
            uint256 remaining = 20_000 ether - totalFunded;
            _fund(shortfall < remaining ? shortfall : remaining);
        }
        _execute(index, true);
    }
}

/// @dev Shared independent assertions, also used by the multi-step attack trace.
abstract contract GovernanceOracleChecks is Test {
    function _assertRequests(GovernanceOracleHandler h) internal view {
        uint256 payments;
        for (uint256 i; i < h.REQUEST_COUNT(); ++i) {
            uint256 count = h.paymentsByRequest(i);
            assertLe(count, 1, "INV01: repeated committed request payment");
            assertEq(h.treasury().paidRequests(h.requestId(i)), count == 1, "INV01: paid flag/history mismatch");
            payments += count;
        }
        assertEq(payments, h.successfulExecutions());
        if (h.sequenceCalls() != 0) assertGe(payments, 1, "non-vacuity: no in-sequence execute");
    }

    function _assertPathAndRoles(GovernanceOracleHandler h) internal view {
        assertFalse(h.unexpectedOutcome(), "SUT outcome/return/event differs from independent model");
        assertEq(h.unauthorizedSuccesses(), 0, "INV02: direct authority bypass");
        Treasury t = h.treasury();
        TimelockController l = h.timelock();
        BudgetGovernor g = h.governor();
        // The universe includes every address to which these fixtures can grant
        // authority, plus zero; AccessControl is not enumerable.
        address[14] memory accounts = [
            address(0),
            h.bootstrap(),
            h.funding(),
            address(h),
            address(t),
            address(l),
            address(g),
            address(h.gov()),
            address(h.bud()),
            h.actor(0),
            h.actor(1),
            h.actor(2),
            h.actor(3),
            h.actor(4)
        ];
        for (uint256 i; i < accounts.length; ++i) {
            _assertRoleHolder(t, l, g, accounts[i]);
        }
        for (uint256 i; i < h.RECIPIENT_COUNT(); ++i) {
            _assertRoleHolder(t, l, g, h.recipient(i));
        }
        assertEq(address(g.token()), address(h.gov()));
        assertEq(address(g.treasury()), address(t));
        assertEq(g.timelock(), address(l));
        assertEq(address(t.budgetToken()), address(h.bud()));
        assertEq(l.getMinDelay(), 120);
        assertEq(g.votingDelay(), 60);
        assertEq(g.votingPeriod(), 300);
        assertEq(g.proposalThreshold(), 50 ether);
        assertEq(g.quorumNumerator(), 20);
        for (uint256 i; i < h.proposalCount(); ++i) {
            GovernanceOracleHandler.Proposal memory p = h.proposal(i);
            assertEq(uint256(g.state(p.id)), uint256(h.expectedState(i)), "INV02: proposal state/history mismatch");
            assertEq(g.proposalProposer(p.id), h.actor(p.proposerIndex));
            assertEq(g.proposalSnapshot(p.id), p.snapshot);
            assertEq(g.proposalDeadline(p.id), p.deadline);
            assertEq(g.proposalEta(p.id), p.eta);
            if (p.eta != 0) {
                assertGt(p.queuedAt, p.deadline, "INV02: queue before deadline");
                assertGe(p.tallies[1] + p.tallies[2], h.QUORUM());
                assertGt(p.tallies[1], p.tallies[0]);
                assertEq(p.eta, p.queuedAt + 120);
                assertEq(l.getTimestamp(p.operation), p.executed ? 1 : p.eta, "INV02: retry changed operation");
            } else {
                assertFalse(l.isOperation(p.operation), "INV02: operation without Governor queue");
            }
            if (p.executed) {
                assertTrue(p.validExecution, "INV02: payout lacked valid proposal/quorum/ETA");
                assertGe(p.executedAt, p.eta);
                assertTrue(l.isOperationDone(p.operation));
                assertEq(h.paymentsByRequest(p.request), 1);
            }
        }
    }

    function _assertRoleHolder(Treasury t, TimelockController l, BudgetGovernor g, address account) internal view {
        assertEq(t.hasRole(t.DEFAULT_ADMIN_ROLE(), account), account == address(l));
        assertEq(t.hasRole(t.SPENDER_ROLE(), account), account == address(l));
        assertEq(l.hasRole(l.DEFAULT_ADMIN_ROLE(), account), account == address(l));
        assertEq(l.hasRole(l.PROPOSER_ROLE(), account), account == address(g));
        assertEq(l.hasRole(l.EXECUTOR_ROLE(), account), account == address(g));
        assertEq(l.hasRole(l.CANCELLER_ROLE(), account), account == address(g));
    }

    function _assertLedger(GovernanceOracleHandler h) internal view {
        uint256 recipientBalances;
        for (uint256 i; i < h.RECIPIENT_COUNT(); ++i) {
            uint256 balance = h.bud().balanceOf(h.recipient(i));
            assertEq(balance, h.received(i), "INV03: recipient ledger mismatch");
            recipientBalances += balance;
        }
        assertEq(recipientBalances, h.totalPaid());
        assertLe(h.totalPaid(), h.totalFunded());
        assertEq(h.bud().balanceOf(address(h.treasury())) + h.totalPaid(), h.totalFunded());
        assertEq(h.bud().balanceOf(h.funding()) + h.totalFunded(), 20_000 ether);
        assertEq(h.bud().totalSupply(), 20_000 ether);
        assertEq(
            h.bud().balanceOf(h.funding()) + h.bud().balanceOf(address(h.treasury())) + recipientBalances, 20_000 ether
        );
    }

    function _assertSnapshots(GovernanceOracleHandler h) internal view {
        uint256[5] memory current = h.currentWeights();
        uint256 balances;
        for (uint256 i; i < h.ACTOR_COUNT(); ++i) {
            assertEq(h.gov().balanceOf(h.actor(i)), h.balances(i));
            assertEq(h.gov().getVotes(h.actor(i)), current[i]);
            assertEq(
                h.gov().delegates(h.actor(i)), h.delegates(i) == h.ACTOR_COUNT() ? address(0) : h.actor(h.delegates(i))
            );
            balances += h.balances(i);
        }
        assertEq(balances, h.SUPPLY());
        assertEq(h.gov().totalSupply(), h.SUPPLY());
        for (uint256 i; i < h.proposalCount(); ++i) {
            GovernanceOracleHandler.Proposal memory p = h.proposal(i);
            (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes) = h.governor().proposalVotes(p.id);
            assertEq(againstVotes, p.tallies[0]);
            assertEq(forVotes, p.tallies[1]);
            assertEq(abstainVotes, p.tallies[2]);
            uint256 snapshotSupply;
            for (uint256 voter; voter < h.ACTOR_COUNT(); ++voter) {
                assertEq(h.governor().hasVoted(p.id, h.actor(voter)), (p.votedMask & (1 << voter)) != 0);
                if (p.pinned) {
                    assertEq(
                        h.gov().getPastVotes(h.actor(voter), p.snapshot),
                        p.weights[voter],
                        "INV04: changed snapshot weight"
                    );
                    snapshotSupply += p.weights[voter];
                }
            }
            if (p.pinned) {
                assertEq(h.gov().getPastTotalSupply(p.snapshot), h.SUPPLY());
                assertLe(snapshotSupply, h.SUPPLY()); // Undelegated supply need not have a vote.
                assertLe(againstVotes + forVotes + abstainVotes, snapshotSupply, "INV04: snapshot votes reused");
            }
        }
    }
}

/// @notice Local INV01-INV04 only; profile.ci provides the required 100 x 50.
/// @dev Reachability is intentionally biased, not a liveness claim for every
/// arbitrary EOA strategy. Unauthorized calls are bounded to the role universe.
contract GovernanceInvariantTest is GovernanceOracleChecks {
    GovernanceOracleHandler internal handler;

    function setUp() public {
        vm.warp(10_000);
        handler = new GovernanceOracleHandler();
        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = GovernanceOracleHandler.lifecycle.selector;
        selectors[1] = GovernanceOracleHandler.propose.selector;
        selectors[2] = GovernanceOracleHandler.vote.selector;
        selectors[3] = GovernanceOracleHandler.advance.selector;
        selectors[4] = GovernanceOracleHandler.queue.selector;
        selectors[5] = GovernanceOracleHandler.execute.selector;
        selectors[6] = GovernanceOracleHandler.cancel.selector;
        selectors[7] = GovernanceOracleHandler.fund.selector;
        selectors[8] = GovernanceOracleHandler.transferGov.selector;
        selectors[9] = GovernanceOracleHandler.delegateGov.selector;
        selectors[10] = GovernanceOracleHandler.unauthorized.selector;
        selectors[11] = GovernanceOracleHandler.tamper.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_INV01_requestPaymentsAreUniqueAcrossProposalsAndRetries() public view {
        _assertRequests(handler);
    }

    function invariant_INV02_everyPayoutHasValidGovernanceAndFinalRoles() public view {
        _assertPathAndRoles(handler);
    }

    function invariant_INV03_treasuryAndRecipientsMatchCommittedLedger() public view {
        _assertLedger(handler);
    }

    function invariant_INV04_snapshotWeightsAndTalliesRemainIndependentOfTokenChanges() public view {
        _assertSnapshots(handler);
    }

    function afterInvariant() public {
        assertGt(handler.sequenceCalls(), 0, "empty campaign");
        assertGt(handler.reachableExecutions(), 0, "no successful Governor execution inside sequence");
        assertFalse(handler.unexpectedOutcome(), "sticky unexpected result");
        emit log_named_uint("sequence actions", handler.sequenceCalls());
        emit log_named_uint("reachable lifecycle calls", handler.reachableCalls());
        emit log_named_uint("Governor execute successes", handler.successfulExecutions());
        emit log_named_uint("unassisted execute successes", handler.spontaneousExecutions());
        emit log_named_uint("execute reverts", handler.reverts(uint256(GovernanceOracleHandler.CallKind.Execute)));
        emit log_named_uint("vote successes", handler.successes(uint256(GovernanceOracleHandler.CallKind.Vote)));
        emit log_named_uint("queue successes", handler.successes(uint256(GovernanceOracleHandler.CallKind.Queue)));
        emit log_named_uint("cancel successes", handler.successes(uint256(GovernanceOracleHandler.CallKind.Cancel)));
        emit log_named_uint(
            "unauthorized reverts", handler.reverts(uint256(GovernanceOracleHandler.CallKind.Unauthorized))
        );
        emit log_named_uint("total BUD funded", handler.totalFunded());
        emit log_named_uint("total BUD paid", handler.totalPaid());
    }
}
