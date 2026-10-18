// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {GovernanceToken} from "../../contracts/GovernanceToken.sol";
import {Votes} from "@openzeppelin/contracts/governance/utils/Votes.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract GovernanceTokenTest is Test {
    GovernanceToken internal token;
    address internal a = makeAddr("A");
    address internal b = makeAddr("B");
    address internal c = makeAddr("C");
    address internal d = makeAddr("D");

    function setUp() public {
        vm.warp(1_000);
        token = new GovernanceToken(a, b, c, d);
    }

    function testMetadataAndInitialDistribution() public view {
        assertEq(token.name(), "Governance Token");
        assertEq(token.symbol(), "GOV");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), 1_000 ether);
        assertEq(token.balanceOf(a), 400 ether);
        assertEq(token.balanceOf(b), 300 ether);
        assertEq(token.balanceOf(c), 200 ether);
        assertEq(token.balanceOf(d), 100 ether);
        assertEq(token.balanceOf(address(this)), 0);
    }

    function testNoVotingPowerBeforeDelegation() public view {
        assertEq(token.delegates(a), address(0));
        assertEq(token.getVotes(a), 0);
        assertEq(token.getVotes(b), 0);
        assertEq(token.getVotes(c), 0);
        assertEq(token.getVotes(d), 0);
        assertEq(token.numCheckpoints(a), 0);
    }

    function testSelfDelegateWritesTimestampCheckpoint() public {
        vm.prank(a);
        token.delegate(a);
        assertEq(token.delegates(a), a);
        assertEq(token.getVotes(a), 400 ether);
        assertEq(token.numCheckpoints(a), 1);
        assertEq(token.checkpoints(a, 0)._key, 1_000);
        assertEq(token.checkpoints(a, 0)._value, 400 ether);
    }

    function testDelegateToOtherWalletDoesNotTransferTokens() public {
        vm.prank(a);
        token.delegate(b);
        assertEq(token.delegates(a), b);
        assertEq(token.getVotes(a), 0);
        assertEq(token.getVotes(b), 400 ether);
        assertEq(token.balanceOf(a), 400 ether);
        assertEq(token.balanceOf(b), 300 ether);
        vm.prank(b);
        token.delegate(b);
        assertEq(token.getVotes(b), 700 ether);
    }

    function testClockUsesTimestampRatherThanBlockNumber() public {
        vm.roll(99);
        assertEq(token.clock(), 1_000);
        assertEq(token.CLOCK_MODE(), "mode=timestamp");
        vm.warp(1_060);
        assertEq(token.clock(), 1_060);
    }

    function testPastVotesAndPastSupply() public {
        vm.prank(a);
        token.delegate(a);
        vm.warp(1_001);
        assertEq(token.getPastVotes(a, 1_000), 400 ether);
        assertEq(token.getPastTotalSupply(1_000), 1_000 ether);
        assertEq(token.getPastVotes(a, 999), 0);
        assertEq(token.getPastTotalSupply(999), 0);
    }

    function testTransferAfterSnapshotPreservesHistory() public {
        vm.prank(a);
        token.delegate(a);
        vm.prank(b);
        token.delegate(b);
        vm.warp(1_001);
        vm.prank(a);
        token.transfer(b, 100 ether);
        assertEq(token.getVotes(a), 300 ether);
        assertEq(token.getVotes(b), 400 ether);
        assertEq(token.getPastVotes(a, 1_000), 400 ether);
        assertEq(token.getPastVotes(b, 1_000), 300 ether);
        assertEq(token.getPastTotalSupply(1_000), 1_000 ether);
        assertEq(token.numCheckpoints(a), 2);
        vm.warp(1_002);
        assertEq(token.getPastVotes(a, 1_001), 300 ether);
        assertEq(token.getPastVotes(b, 1_001), 400 ether);
    }

    function testChangingDelegateAfterSnapshotPreservesHistory() public {
        vm.prank(a);
        token.delegate(a);
        vm.warp(1_001);
        vm.prank(a);
        token.delegate(b);
        assertEq(token.getVotes(a), 0);
        assertEq(token.getVotes(b), 400 ether);
        assertEq(token.getPastVotes(a, 1_000), 400 ether);
        assertEq(token.getPastVotes(b, 1_000), 0);
        vm.warp(1_002);
        assertEq(token.getPastVotes(a, 1_001), 0);
        assertEq(token.getPastVotes(b, 1_001), 400 ether);
    }

    function testDelegationAfterSnapshotDoesNotCreatePastVotes() public {
        vm.warp(1_001);
        vm.prank(a);
        token.delegate(a);
        assertEq(token.getPastVotes(a, 1_000), 0);
        assertEq(token.getVotes(a), 400 ether);
    }

    function testSameTimestampUpdatesSingleCheckpoint() public {
        vm.startPrank(a);
        token.delegate(a);
        token.transfer(b, 100 ether);
        vm.stopPrank();
        assertEq(token.numCheckpoints(a), 1);
        assertEq(token.checkpoints(a, 0)._value, 300 ether);
        vm.warp(1_001);
        assertEq(token.getPastVotes(a, 1_000), 300 ether);
    }

    function testCurrentTimepointLookupReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Votes.ERC5805FutureLookup.selector, uint256(1_000), uint48(1_000)));
        token.getPastVotes(a, 1_000);
        vm.expectRevert(abi.encodeWithSelector(Votes.ERC5805FutureLookup.selector, uint256(1_000), uint48(1_000)));
        token.getPastTotalSupply(1_000);
    }

    function testFutureTimepointLookupReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Votes.ERC5805FutureLookup.selector, uint256(1_001), uint48(1_000)));
        token.getPastVotes(a, 1_001);
        vm.expectRevert(abi.encodeWithSelector(Votes.ERC5805FutureLookup.selector, uint256(1_001), uint48(1_000)));
        token.getPastTotalSupply(1_001);
    }

    function testFuzzConstructorRejectsZeroRecipient(uint8 index) public {
        address[4] memory holders = [a, b, c, d];
        holders[bound(index, 0, 3)] = address(0);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        new GovernanceToken(holders[0], holders[1], holders[2], holders[3]);
    }

    function testNoPublicMint() public {
        vm.prank(a);
        (bool success,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", a, 1 ether));
        assertFalse(success);
        assertEq(token.totalSupply(), 1_000 ether);
        assertEq(token.balanceOf(a), 400 ether);
    }

    function testFuzzTransferAndDelegationPreserveSupply(uint256 amount) public {
        amount = bound(amount, 0, 400 ether);
        vm.startPrank(a);
        token.delegate(b);
        token.transfer(c, amount);
        vm.stopPrank();
        assertEq(token.totalSupply(), 1_000 ether);
        assertEq(token.balanceOf(a) + token.balanceOf(b) + token.balanceOf(c) + token.balanceOf(d), 1_000 ether);
        assertEq(token.getVotes(b), 400 ether - amount);
    }
}
