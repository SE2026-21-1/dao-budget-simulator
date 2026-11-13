// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";
import {Treasury} from "../../contracts/Treasury.sol";
import {BudgetToken} from "../../contracts/BudgetToken.sol";
import {ITreasury} from "../../contracts/interfaces/ITreasury.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Adversarial test fixture, never used as the production BUD.
contract CallbackBudgetToken is ERC20 {
    Treasury public target;
    bytes public callbackData;
    bytes32 public watchedRequest;
    bool public returnFalse;
    bool public revertTransfer;
    bool private entered;
    bool public callbackSucceeded;
    bool public observedPaid;
    bytes public callbackError;
    uint256 public callbacks;
    uint256 public transfers;

    constructor(address holder) ERC20("Mock BUD", "MBUD") {
        _mint(holder, 20_000 ether);
    }

    function configure(Treasury treasury, bytes32 request, bytes memory data, bool fail, bool revertAfterTransfer)
        external
    {
        target = treasury;
        watchedRequest = request;
        callbackData = data;
        returnFalse = fail;
        revertTransfer = revertAfterTransfer;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        super.transfer(to, amount);
        transfers++;
        if (msg.sender == address(target) && !entered && callbackData.length != 0) {
            entered = true;
            observedPaid = target.paidRequests(watchedRequest);
            callbacks++;
            (callbackSucceeded, callbackError) = address(target).call(callbackData);
            entered = false;
        }
        if (msg.sender == address(target)) {
            require(!revertTransfer, "mock failure after transfer");
            if (returnFalse) return false;
        }
        return true;
    }
}

contract TreasuryTest is Test {
    BudgetToken internal token;
    Treasury internal treasury;
    address internal admin = makeAddr("bootstrapAdmin");
    address internal timelock = makeAddr("mockTimelock");
    address internal holder = makeAddr("fundingWallet");
    address internal recipient = makeAddr("recipient");
    address internal outsider = makeAddr("outsider");
    bytes32 internal constant REQUEST = keccak256("request-1");
    bytes32 internal constant SPENDER = keccak256("SPENDER_ROLE");
    bytes32 internal constant ADMIN = bytes32(0);

    function setUp() public {
        token = new BudgetToken(holder);
        treasury = new Treasury(address(token), admin);
        vm.prank(admin);
        treasury.grantRole(SPENDER, timelock);
        vm.prank(holder);
        token.transfer(address(treasury), 10_000 ether);
    }

    function _pay(bytes32 id, address to, uint256 amount) internal {
        vm.prank(timelock);
        treasury.disburse(id, to, amount);
    }

    function _denied(address caller, bytes32 role) internal {
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, caller, role));
    }

    function testConstructorTokenAndBootstrapRoles() public {
        Treasury fresh = new Treasury(address(token), admin);
        assertEq(address(fresh.budgetToken()), address(token));
        assertEq(fresh.SPENDER_ROLE(), SPENDER);
        assertEq(fresh.getRoleAdmin(SPENDER), ADMIN);
        assertEq(fresh.getRoleAdmin(ADMIN), ADMIN);
        assertTrue(fresh.hasRole(ADMIN, admin));
        assertFalse(fresh.hasRole(SPENDER, admin));
        assertFalse(fresh.hasRole(ADMIN, address(this)));
        assertFalse(fresh.hasRole(SPENDER, address(0)));
        assertFalse(fresh.paidRequests(REQUEST));
    }

    function testConstructorRejectsZeroToken() public {
        vm.expectRevert(abi.encodeWithSelector(Treasury.InvalidBudgetToken.selector, address(0)));
        new Treasury(address(0), admin);
    }

    function testConstructorRejectsTokenWithoutCode() public {
        vm.expectRevert(abi.encodeWithSelector(Treasury.InvalidBudgetToken.selector, outsider));
        new Treasury(outsider, admin);
    }

    function testConstructorRejectsZeroAdmin() public {
        vm.expectRevert(abi.encodeWithSelector(Treasury.InvalidAdmin.selector, address(0)));
        new Treasury(address(token), address(0));
    }

    function testAuthorizedPaymentBalancesAndEvent() public {
        vm.expectEmit(true, true, false, true, address(treasury));
        emit ITreasury.BudgetDisbursed(REQUEST, recipient, 1_000 ether);
        _pay(REQUEST, recipient, 1_000 ether);
        assertTrue(treasury.paidRequests(REQUEST));
        assertEq(token.balanceOf(address(treasury)), 9_000 ether);
        assertEq(token.balanceOf(recipient), 1_000 ether);
        assertEq(token.totalSupply(), 20_000 ether);
    }

    function testOrdinaryWalletCannotPay() public {
        _denied(outsider, SPENDER);
        vm.prank(outsider);
        treasury.disburse(REQUEST, recipient, 1 ether);
        assertFalse(treasury.paidRequests(REQUEST));
        assertEq(token.balanceOf(address(treasury)), 10_000 ether);
        assertEq(token.balanceOf(recipient), 0);
    }

    function testAdminWithoutSpenderCannotPay() public {
        _denied(admin, SPENDER);
        vm.prank(admin);
        treasury.disburse(REQUEST, recipient, 1 ether);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testZeroRecipientReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Treasury.InvalidRecipient.selector, address(0)));
        _pay(REQUEST, address(0), 1 ether);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testTreasuryRecipientReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Treasury.InvalidRecipient.selector, address(treasury)));
        _pay(REQUEST, address(treasury), 1 ether);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testZeroAmountReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Treasury.InvalidAmount.selector, uint256(0)));
        _pay(REQUEST, recipient, 0);
        assertFalse(treasury.paidRequests(REQUEST));
    }

    function testDuplicateRequestReverts() public {
        _pay(REQUEST, recipient, 1_000 ether);
        vm.expectRevert(abi.encodeWithSelector(Treasury.RequestAlreadyPaid.selector, REQUEST));
        _pay(REQUEST, recipient, 1_000 ether);
        assertEq(token.balanceOf(address(treasury)), 9_000 ether);
        assertEq(token.balanceOf(recipient), 1_000 ether);
    }

    function testDuplicateRequestWithDifferentRecipientReverts() public {
        _pay(REQUEST, recipient, 1_000 ether);
        vm.expectRevert(abi.encodeWithSelector(Treasury.RequestAlreadyPaid.selector, REQUEST));
        _pay(REQUEST, outsider, 1_000 ether);
        assertEq(token.balanceOf(outsider), 0);
        assertEq(token.balanceOf(address(treasury)), 9_000 ether);
    }

    function testDuplicateRequestWithDifferentAmountReverts() public {
        _pay(REQUEST, recipient, 1_000 ether);
        vm.expectRevert(abi.encodeWithSelector(Treasury.RequestAlreadyPaid.selector, REQUEST));
        _pay(REQUEST, recipient, 1 ether);
        assertEq(token.balanceOf(recipient), 1_000 ether);
    }

    function testZeroRequestIdCanBePaidOnlyOnce() public {
        _pay(bytes32(0), recipient, 1 ether);
        assertTrue(treasury.paidRequests(bytes32(0)));
        vm.expectRevert(abi.encodeWithSelector(Treasury.RequestAlreadyPaid.selector, bytes32(0)));
        _pay(bytes32(0), recipient, 1 ether);
    }

    function testInsufficientBudgetRevertsAndCanRetryAfterFunding() public {
        vm.expectRevert(abi.encodeWithSelector(Treasury.InsufficientBudget.selector, 10_000 ether, 11_000 ether));
        _pay(REQUEST, recipient, 11_000 ether);
        assertFalse(treasury.paidRequests(REQUEST));
        assertEq(token.balanceOf(address(treasury)), 10_000 ether);
        assertEq(token.balanceOf(recipient), 0);
        vm.prank(holder);
        token.transfer(address(treasury), 1_000 ether);
        _pay(REQUEST, recipient, 11_000 ether);
        assertTrue(treasury.paidRequests(REQUEST));
        assertEq(token.balanceOf(address(treasury)), 0);
        assertEq(token.balanceOf(recipient), 11_000 ether);
        assertEq(token.balanceOf(holder), 9_000 ether);
        assertEq(token.totalSupply(), 20_000 ether);
    }

    function testCompetingRequestsUseExecutionBalance() public {
        _pay(REQUEST, recipient, 6_000 ether);
        bytes32 second = keccak256("request-2");
        vm.expectRevert(abi.encodeWithSelector(Treasury.InsufficientBudget.selector, 4_000 ether, 5_000 ether));
        _pay(second, outsider, 5_000 ether);
        assertFalse(treasury.paidRequests(second));
        vm.prank(holder);
        token.transfer(address(treasury), 1_000 ether);
        _pay(second, outsider, 5_000 ether);
        assertEq(token.balanceOf(address(treasury)), 0);
        assertEq(token.balanceOf(recipient), 6_000 ether);
        assertEq(token.balanceOf(outsider), 5_000 ether);
        assertEq(token.totalSupply(), 20_000 ether);
    }

    function testFalseTokenTransferRollsBackPaidFlag() public {
        bytes memory callData = abi.encodeCall(IERC20.transfer, (recipient, 1_000 ether));
        vm.mockCall(address(token), callData, abi.encode(false));
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token)));
        _pay(REQUEST, recipient, 1_000 ether);
        assertFalse(treasury.paidRequests(REQUEST));
        assertEq(token.balanceOf(address(treasury)), 10_000 ether);
        assertEq(token.balanceOf(recipient), 0);
        vm.clearMockedCalls();
        _pay(REQUEST, recipient, 1_000 ether);
        assertTrue(treasury.paidRequests(REQUEST));
    }

    function testRevertingTokenTransferRollsBackPaidFlag() public {
        bytes memory reason = abi.encodeWithSignature("Error(string)", "transfer failure");
        vm.mockCallRevert(address(token), abi.encodeCall(IERC20.transfer, (recipient, 1 ether)), reason);
        vm.expectRevert(reason);
        _pay(REQUEST, recipient, 1 ether);
        assertFalse(treasury.paidRequests(REQUEST));
        assertEq(token.balanceOf(address(treasury)), 10_000 ether);
        assertEq(token.balanceOf(recipient), 0);
    }

    function testGrantAndRevokeSpendingRole() public {
        vm.prank(admin);
        treasury.grantRole(SPENDER, outsider);
        assertTrue(treasury.hasRole(SPENDER, outsider));
        vm.prank(outsider);
        treasury.disburse(REQUEST, recipient, 1 ether);
        vm.prank(admin);
        treasury.revokeRole(SPENDER, outsider);
        assertFalse(treasury.hasRole(SPENDER, outsider));
        _denied(outsider, SPENDER);
        vm.prank(outsider);
        treasury.disburse(keccak256("new"), recipient, 1 ether);
    }

    function testOutsiderCannotGrantOrRevokeRole() public {
        _denied(outsider, ADMIN);
        vm.prank(outsider);
        treasury.grantRole(SPENDER, outsider);
        _denied(outsider, ADMIN);
        vm.prank(outsider);
        treasury.revokeRole(SPENDER, timelock);
    }

    function testAdminHandoffRemovesAllDeployerPrivileges() public {
        // Simulate a temporary spender grant to prove it must also be removed.
        vm.startPrank(admin);
        treasury.grantRole(SPENDER, admin);
        treasury.revokeRole(SPENDER, admin);
        treasury.grantRole(ADMIN, timelock);
        treasury.renounceRole(ADMIN, admin);
        vm.stopPrank();
        assertFalse(treasury.hasRole(ADMIN, admin));
        assertFalse(treasury.hasRole(SPENDER, admin));
        assertFalse(treasury.hasRole(SPENDER, address(0)));
        assertTrue(treasury.hasRole(ADMIN, timelock));
        assertTrue(treasury.hasRole(SPENDER, timelock));
        _denied(admin, ADMIN);
        vm.prank(admin);
        treasury.grantRole(ADMIN, admin);
        _denied(admin, ADMIN);
        vm.prank(admin);
        treasury.grantRole(SPENDER, admin);
        _denied(admin, ADMIN);
        vm.prank(admin);
        treasury.revokeRole(SPENDER, timelock);
        _denied(admin, SPENDER);
        vm.prank(admin);
        treasury.disburse(REQUEST, recipient, 1 ether);
        _pay(REQUEST, recipient, 1 ether);
        assertTrue(treasury.paidRequests(REQUEST));
    }

    function testNativeValueRejected() public {
        vm.deal(timelock, 1 ether);
        vm.prank(timelock);
        (bool success,) =
            address(treasury).call{value: 1}(abi.encodeCall(ITreasury.disburse, (REQUEST, recipient, 1 ether)));
        assertFalse(success);
        assertFalse(treasury.paidRequests(REQUEST));
        assertEq(token.balanceOf(address(treasury)), 10_000 ether);
    }

    function testFuzzPaymentConservesBudget(uint256 amount) public {
        amount = bound(amount, 1, 10_000 ether);
        _pay(REQUEST, recipient, amount);
        assertEq(token.balanceOf(address(treasury)), 10_000 ether - amount);
        assertEq(token.balanceOf(recipient), amount);
        assertEq(
            token.balanceOf(address(treasury)) + token.balanceOf(recipient) + token.balanceOf(holder), 20_000 ether
        );
        assertEq(token.totalSupply(), 20_000 ether);
        vm.expectRevert(abi.encodeWithSelector(Treasury.RequestAlreadyPaid.selector, REQUEST));
        _pay(REQUEST, outsider, 1);
    }

    function testSpenderWithoutAdminCannotGrantRoles() public {
        assertTrue(treasury.hasRole(SPENDER, timelock));
        assertFalse(treasury.hasRole(ADMIN, timelock));
        _denied(timelock, ADMIN);
        vm.prank(timelock);
        treasury.grantRole(ADMIN, timelock);
        _denied(timelock, ADMIN);
        vm.prank(timelock);
        treasury.grantRole(SPENDER, outsider);
        assertFalse(treasury.hasRole(ADMIN, timelock));
        assertFalse(treasury.hasRole(SPENDER, outsider));
    }

    function testSpenderRenounceStopsFurtherPayments() public {
        _pay(REQUEST, recipient, 1 ether);
        vm.prank(timelock);
        treasury.renounceRole(SPENDER, timelock);
        assertFalse(treasury.hasRole(SPENDER, timelock));
        bytes32 next = keccak256("after-renounce");
        _denied(timelock, SPENDER);
        vm.prank(timelock);
        treasury.disburse(next, recipient, 1 ether);
        assertFalse(treasury.paidRequests(next));
        assertEq(token.balanceOf(recipient), 1 ether);
        assertEq(token.balanceOf(address(treasury)), 9_999 ether);
    }

    function _callbackFixture() internal returns (CallbackBudgetToken mock, Treasury vault) {
        mock = new CallbackBudgetToken(holder);
        vault = new Treasury(address(mock), admin);
        vm.prank(admin);
        vault.grantRole(SPENDER, timelock);
        vm.prank(holder);
        mock.transfer(address(vault), 10_000 ether);
    }

    function testCallbackWithoutSpenderCannotPayDifferentRequest() public {
        (CallbackBudgetToken mock, Treasury vault) = _callbackFixture();
        bytes32 second = keccak256("callback-second");
        mock.configure(vault, REQUEST, abi.encodeCall(ITreasury.disburse, (second, outsider, 1 ether)), false, false);
        vm.prank(timelock);
        vault.disburse(REQUEST, recipient, 1_000 ether);
        assertEq(mock.callbacks(), 1);
        assertTrue(mock.observedPaid());
        assertFalse(mock.callbackSucceeded());
        assertEq(
            mock.callbackError(),
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, address(mock), SPENDER)
        );
        assertTrue(vault.paidRequests(REQUEST));
        assertFalse(vault.paidRequests(second));
        assertEq(mock.balanceOf(address(vault)), 9_000 ether);
        assertEq(mock.balanceOf(recipient), 1_000 ether);
        assertEq(mock.balanceOf(outsider), 0);
    }

    function testAuthorizedCallbackCannotPaySameRequestTwice() public {
        (CallbackBudgetToken mock, Treasury vault) = _callbackFixture();
        // Grant only in this adversarial test to reach replay protection beyond AccessControl.
        vm.prank(admin);
        vault.grantRole(SPENDER, address(mock));
        mock.configure(vault, REQUEST, abi.encodeCall(ITreasury.disburse, (REQUEST, outsider, 2 ether)), false, false);
        vm.prank(timelock);
        vault.disburse(REQUEST, recipient, 1_000 ether);
        assertEq(mock.callbacks(), 1);
        assertTrue(mock.observedPaid());
        assertFalse(mock.callbackSucceeded());
        assertEq(mock.callbackError(), abi.encodeWithSelector(Treasury.RequestAlreadyPaid.selector, REQUEST));
        assertTrue(vault.paidRequests(REQUEST));
        assertEq(mock.balanceOf(address(vault)), 9_000 ether);
        assertEq(mock.balanceOf(recipient), 1_000 ether);
        assertEq(mock.balanceOf(outsider), 0);
        assertEq(mock.totalSupply(), 20_000 ether);
    }

    function testFalseAfterActualTransferRollsBackTokenAndTreasury() public {
        (CallbackBudgetToken mock, Treasury vault) = _callbackFixture();
        uint256 beforeTransfers = mock.transfers();
        mock.configure(vault, REQUEST, "", true, false);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(mock)));
        vm.prank(timelock);
        vault.disburse(REQUEST, recipient, 1_000 ether);
        assertFalse(vault.paidRequests(REQUEST));
        assertEq(mock.transfers(), beforeTransfers);
        assertEq(mock.balanceOf(address(vault)), 10_000 ether);
        assertEq(mock.balanceOf(recipient), 0);
        assertEq(mock.totalSupply(), 20_000 ether);
        mock.configure(vault, REQUEST, "", false, false);
        vm.prank(timelock);
        vault.disburse(REQUEST, recipient, 1_000 ether);
        assertTrue(vault.paidRequests(REQUEST));
        assertEq(mock.transfers(), beforeTransfers + 1);
        assertEq(mock.balanceOf(address(vault)), 9_000 ether);
        assertEq(mock.balanceOf(recipient), 1_000 ether);
    }

    function testRevertAfterActualTransferRollsBackTokenAndTreasury() public {
        (CallbackBudgetToken mock, Treasury vault) = _callbackFixture();
        uint256 beforeTransfers = mock.transfers();
        mock.configure(vault, REQUEST, "", false, true);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "mock failure after transfer"));
        vm.prank(timelock);
        vault.disburse(REQUEST, recipient, 1_000 ether);
        assertFalse(vault.paidRequests(REQUEST));
        assertEq(mock.transfers(), beforeTransfers);
        assertEq(mock.balanceOf(address(vault)), 10_000 ether);
        assertEq(mock.balanceOf(recipient), 0);
        assertEq(mock.totalSupply(), 20_000 ether);
    }

    function testMultipleDepositsAndPaymentsWithDistinctRequests() public {
        uint256 totalIn = 10_000 ether;
        uint256 totalOut;
        for (uint256 i = 1; i <= 5; ++i) {
            vm.prank(holder);
            token.transfer(address(treasury), 100 ether);
            totalIn += 100 ether;
            bytes32 id = keccak256(abi.encode("sequence", i));
            uint256 amount = i * 100 ether;
            _pay(id, recipient, amount);
            totalOut += amount;
            assertTrue(treasury.paidRequests(id));
            assertEq(token.balanceOf(address(treasury)), totalIn - totalOut);
            assertEq(token.balanceOf(recipient), totalOut);
            assertEq(token.balanceOf(holder), 20_000 ether - totalIn);
            assertEq(token.totalSupply(), 20_000 ether);
            vm.expectRevert(abi.encodeWithSelector(Treasury.RequestAlreadyPaid.selector, id));
            _pay(id, outsider, 1);
        }
        assertEq(token.balanceOf(address(treasury)), 9_000 ether);
        assertEq(token.balanceOf(recipient), 1_500 ether);
        assertEq(token.balanceOf(holder), 9_500 ether);
    }
}
