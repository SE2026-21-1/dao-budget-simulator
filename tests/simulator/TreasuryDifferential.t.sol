// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Treasury} from "../../contracts/Treasury.sol";
import {BudgetToken} from "../../contracts/BudgetToken.sol";

/// @dev Test-VM observations consumed by Node. No RPC, FFI, broadcast or filesystem cheatcodes.
contract TreasuryDifferentialTest is Test {
    struct Request {
        bytes32 id;
        address recipient;
        uint256 amount;
    }

    struct Step {
        uint8 kind; // 0: disburse; 1: fund using a real BUD transfer
        uint256 proposalIndex;
        uint256 amount;
    }

    struct Observation {
        bool success;
        uint256 balance;
        bool[] paid;
    }

    function _requests(uint256 first, uint256 second, bool shared) internal pure returns (Request[] memory requests) {
        requests = new Request[](2);
        requests[0] = Request(bytes32(uint256(1)), address(0xA11CE), first);
        requests[1] = Request(shared ? bytes32(uint256(1)) : bytes32(uint256(2)), address(0xB0B), second);
    }

    function _paid(Treasury treasury, Request[] memory requests) internal view returns (bool[] memory paid) {
        paid = new bool[](requests.length);
        for (uint256 i; i < requests.length; ++i) {
            paid[i] = treasury.paidRequests(requests[i].id);
        }
    }

    function _run(uint256 funding, Request[] memory requests, Step[] memory steps, bool prepay) internal {
        BudgetToken token = new BudgetToken(address(this));
        Treasury treasury = new Treasury(address(token), address(this));
        treasury.grantRole(treasury.SPENDER_ROLE(), address(this));
        assertTrue(token.transfer(address(treasury), funding));
        if (prepay) treasury.disburse(requests[0].id, requests[0].recipient, requests[0].amount);
        uint256 initialBalance = token.balanceOf(address(treasury));
        bool[] memory initialPaid = _paid(treasury, requests);
        Observation[] memory observations = new Observation[](steps.length);
        for (uint256 i; i < steps.length; ++i) {
            Step memory step = steps[i];
            bool success;
            if (step.kind == 1) {
                success = token.transfer(address(treasury), step.amount);
            } else {
                Request memory request = requests[step.proposalIndex];
                (success,) = address(treasury)
                    .call(abi.encodeCall(Treasury.disburse, (request.id, request.recipient, request.amount)));
            }
            observations[i] = Observation(success, token.balanceOf(address(treasury)), _paid(treasury, requests));
        }
        emit log_named_bytes(
            "WHAT_IF_TREASURY",
            abi.encode(address(treasury), initialBalance, requests, steps, initialPaid, observations)
        );
    }

    function testDifferentialSuccessAndExactBalance() public {
        Step[] memory steps = new Step[](2);
        steps[0] = Step(0, 0, 0);
        steps[1] = Step(0, 1, 0);
        _run(100, _requests(25, 75, false), steps, false);
    }

    function testDifferentialInsufficientFunds() public {
        Step[] memory steps = new Step[](1);
        steps[0] = Step(0, 0, 0);
        _run(5, _requests(10, 1, false), steps, false);
    }

    function testDifferentialSharedRequestAndReplay() public {
        Step[] memory steps = new Step[](3);
        steps[0] = Step(0, 0, 0);
        steps[1] = Step(0, 1, 0);
        steps[2] = Step(0, 0, 0);
        _run(100, _requests(25, 30, true), steps, false);
    }

    function testDifferentialFundingAndRetry() public {
        Step[] memory steps = new Step[](6);
        steps[0] = Step(0, 0, 0);
        steps[1] = Step(1, 0, 8);
        steps[2] = Step(0, 0, 0);
        steps[3] = Step(1, 0, 1);
        steps[4] = Step(0, 0, 0);
        steps[5] = Step(0, 0, 0);
        _run(1, _requests(10, 1, false), steps, false);
    }

    function testDifferentialLargeFirst() public {
        Step[] memory steps = new Step[](2);
        steps[0] = Step(0, 0, 0);
        steps[1] = Step(0, 1, 0);
        _run(10, _requests(8, 4, false), steps, false);
    }

    function testDifferentialSmallFirst() public {
        Step[] memory steps = new Step[](2);
        steps[0] = Step(0, 1, 0);
        steps[1] = Step(0, 0, 0);
        _run(10, _requests(8, 4, false), steps, false);
    }

    function testDifferentialFailedSharedRequestCanStillBePaid() public {
        Step[] memory steps = new Step[](2);
        steps[0] = Step(0, 0, 0);
        steps[1] = Step(0, 1, 0);
        _run(10, _requests(11, 5, true), steps, false);
    }

    function testDifferentialZeroIdAndExistingPaidState() public {
        Request[] memory requests = _requests(5, 2, false);
        requests[0].id = bytes32(0);
        Step[] memory steps = new Step[](2);
        steps[0] = Step(0, 0, 0);
        steps[1] = Step(0, 1, 0);
        _run(10, requests, steps, true);
    }
}
