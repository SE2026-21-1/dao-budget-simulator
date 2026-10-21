// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BudgetToken} from "../../contracts/BudgetToken.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract BudgetTokenTest is Test {
    BudgetToken internal token;
    address internal fundingWallet = makeAddr("fundingWallet");
    address internal treasury = makeAddr("futureTreasury");
    address internal recipient = makeAddr("recipient");
    address internal spender = makeAddr("spender");

    function setUp() public {
        token = new BudgetToken(fundingWallet);
    }

    function testMetadataAndInitialSupply() public view {
        assertEq(token.name(), "Budget Token");
        assertEq(token.symbol(), "BUD");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), 20_000 ether);
        assertEq(token.balanceOf(fundingWallet), 20_000 ether);
        assertEq(token.balanceOf(address(this)), 0);
    }

    function testDemoDistributionWithoutTreasuryConstructorDependency() public {
        vm.prank(fundingWallet);
        assertTrue(token.transfer(treasury, 10_000 ether));
        assertEq(token.balanceOf(treasury), 10_000 ether);
        assertEq(token.balanceOf(fundingWallet), 10_000 ether);
        assertEq(token.totalSupply(), 20_000 ether);
    }

    function testTransferHasNoFee() public {
        vm.prank(fundingWallet);
        assertTrue(token.transfer(recipient, 1_000 ether));
        assertEq(token.balanceOf(recipient), 1_000 ether);
        assertEq(token.balanceOf(fundingWallet), 19_000 ether);
        assertEq(token.totalSupply(), 20_000 ether);
    }

    function testApproveAndTransferFrom() public {
        vm.prank(fundingWallet);
        assertTrue(token.approve(spender, 1_000 ether));
        assertEq(token.allowance(fundingWallet, spender), 1_000 ether);
        vm.prank(spender);
        assertTrue(token.transferFrom(fundingWallet, recipient, 400 ether));
        assertEq(token.allowance(fundingWallet, spender), 600 ether);
        assertEq(token.balanceOf(fundingWallet), 19_600 ether);
        assertEq(token.balanceOf(recipient), 400 ether);
        assertEq(token.totalSupply(), 20_000 ether);
    }

    function testTransferAboveBalanceReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, fundingWallet, 20_000 ether, 20_001 ether
            )
        );
        vm.prank(fundingWallet);
        token.transfer(recipient, 20_001 ether);
        assertEq(token.balanceOf(fundingWallet), 20_000 ether);
        assertEq(token.balanceOf(recipient), 0);
    }

    function testTransferFromAboveAllowanceReverts() public {
        vm.prank(fundingWallet);
        token.approve(spender, 100 ether);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, spender, 100 ether, 101 ether)
        );
        vm.prank(spender);
        token.transferFrom(fundingWallet, recipient, 101 ether);
        assertEq(token.allowance(fundingWallet, spender), 100 ether);
        assertEq(token.balanceOf(fundingWallet), 20_000 ether);
        assertEq(token.balanceOf(recipient), 0);
    }

    function testZeroInitialHolderReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        new BudgetToken(address(0));
    }

    function testNoPublicMint() public {
        vm.prank(fundingWallet);
        (bool success,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", fundingWallet, 1 ether));
        assertFalse(success);
        assertEq(token.totalSupply(), 20_000 ether);
        assertEq(token.balanceOf(fundingWallet), 20_000 ether);
    }

    function testFuzzTransfersPreserveSupply(uint256 amount) public {
        amount = bound(amount, 0, 20_000 ether);
        vm.prank(fundingWallet);
        token.transfer(recipient, amount);
        assertEq(token.totalSupply(), 20_000 ether);
        assertEq(token.balanceOf(recipient), amount);
        assertEq(token.balanceOf(fundingWallet), 20_000 ether - amount);
    }
}
