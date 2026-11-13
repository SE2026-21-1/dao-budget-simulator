// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BudgetToken} from "../../contracts/BudgetToken.sol";
import {Treasury} from "../../contracts/Treasury.sol";
import {ITreasury} from "../../contracts/interfaces/ITreasury.sol";

/// @dev Treasury-only model: real, fixed-supply BUD; no Governor or Timelock simulation.
/// Recipients never transfer tokens, and the handler is the only funding wallet/admin.
contract TreasuryAccountingHandler is Test {
    uint256 public constant REQUEST_COUNT = 16;
    uint256 public constant RECIPIENT_COUNT = 4;
    uint256 public constant ACTOR_COUNT = 4;
    bytes32 internal constant SPENDER = keccak256("SPENDER_ROLE");

    BudgetToken public immutable token;
    Treasury public immutable treasury;
    bool[4] public expectedSpender;
    uint256[16] public successfulPaymentsByRequest;
    uint256[4] public received;
    uint256 public totalFunded;
    uint256 public totalPaid;
    uint256 public successfulPayments;
    uint256 public rejectedPayments;
    uint256 public unauthorizedAttempts;
    uint256 public unauthorizedSuccesses;
    bool public unexpectedOutcome;

    constructor() {
        token = new BudgetToken(address(this));
        treasury = new Treasury(address(token), address(this));
    }

    function actor(uint256 index) public pure returns (address) {
        return address(uint160(0xA110 + index % ACTOR_COUNT));
    }

    function recipient(uint256 index) public pure returns (address) {
        return address(uint160(0xB220 + index % RECIPIENT_COUNT));
    }

    function fund(uint256 amountSeed) external {
        uint256 available = token.balanceOf(address(this));
        if (available == 0) return;
        uint256 amount = bound(amountSeed, 1, available);
        token.transfer(address(treasury), amount);
        totalFunded += amount;
    }

    /// @dev Actor 3 is permanently unprivileged. The other actors can cycle through
    /// grant, revoke, and self-renounce without resetting request/payment history.
    function changeRole(uint256 actorSeed, uint256 transitionSeed) external {
        uint256 index = actorSeed % (ACTOR_COUNT - 1);
        uint256 transition = transitionSeed % 3;
        if (transition == 0) {
            treasury.grantRole(SPENDER, actor(index));
            expectedSpender[index] = true;
        } else if (transition == 1) {
            treasury.revokeRole(SPENDER, actor(index));
            expectedSpender[index] = false;
        } else {
            vm.prank(actor(index));
            treasury.renounceRole(SPENDER, actor(index));
            expectedSpender[index] = false;
        }
    }

    /// @dev Includes zero/over-budget amounts and replay attempts across callers.
    function pay(uint256 actorSeed, uint256 requestSeed, uint256 recipientSeed, uint256 amountSeed) external {
        _pay(actorSeed, requestSeed, recipientSeed, bound(amountSeed, 0, 20_001 ether));
    }

    /// @dev Bias part of the campaign toward executable amounts instead of an
    /// all-revert corpus. Authorization and replay checks are still exercised.
    function payAvailable(uint256 actorSeed, uint256 requestSeed, uint256 recipientSeed, uint256 amountSeed) external {
        if (totalPaid >= totalFunded) return;
        _pay(actorSeed, requestSeed, recipientSeed, bound(amountSeed, 1, totalFunded - totalPaid));
    }

    function _pay(uint256 actorSeed, uint256 requestSeed, uint256 recipientSeed, uint256 amount) internal {
        uint256 callerIndex = actorSeed % ACTOR_COUNT;
        uint256 requestIndex = requestSeed % REQUEST_COUNT;
        uint256 recipientIndex = recipientSeed % RECIPIENT_COUNT;
        bool authorized = expectedSpender[callerIndex];
        // This prediction never reads Treasury.paidRequests or Treasury's balance.
        bool shouldSucceed = authorized && successfulPaymentsByRequest[requestIndex] == 0 && amount > 0
            && totalPaid <= totalFunded && amount <= totalFunded - totalPaid;

        vm.prank(actor(callerIndex));
        (bool success,) = address(treasury)
            .call(abi.encodeCall(ITreasury.disburse, (bytes32(requestIndex), recipient(recipientIndex), amount)));

        // Sticky evidence survives subsequent calls and does not depend on the
        // invariant runner's fail_on_revert setting to retain a failed assertion.
        if (success != shouldSucceed) unexpectedOutcome = true;
        if (!authorized) {
            unauthorizedAttempts++;
            if (success) unauthorizedSuccesses++;
        }
        if (success) {
            successfulPaymentsByRequest[requestIndex]++;
            received[recipientIndex] += amount;
            totalPaid += amount;
            successfulPayments++;
        } else {
            rejectedPayments++;
        }
    }
}

/// @notice Independent TV4 Treasury accounting/authorization scope only.
/// @dev Not full INV01-INV04 or governance acceptance. Uses profile.ci's 100 x 50 campaign.
contract TreasuryAccountingInvariantTest is Test {
    TreasuryAccountingHandler internal handler;
    BudgetToken internal token;
    Treasury internal treasury;

    function setUp() public {
        handler = new TreasuryAccountingHandler();
        token = handler.token();
        treasury = handler.treasury();

        // Every campaign starts with a genuine successful payment, not merely a
        // conditional invariant over an unreachable successful-payment branch.
        handler.fund(1_000 ether);
        handler.changeRole(0, 0);
        handler.pay(0, 0, 0, 100 ether);
        assertEq(handler.successfulPayments(), 1);
        assertEq(token.balanceOf(handler.recipient(0)), 100 ether);

        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = TreasuryAccountingHandler.fund.selector;
        selectors[1] = TreasuryAccountingHandler.changeRole.selector;
        selectors[2] = TreasuryAccountingHandler.pay.selector;
        selectors[3] = TreasuryAccountingHandler.payAvailable.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_accountingMatchesSuccessfulPaymentOracle() public view {
        uint256 recipientBalances;
        uint256 oracleReceived;
        for (uint256 i; i < handler.RECIPIENT_COUNT(); ++i) {
            uint256 balance = token.balanceOf(handler.recipient(i));
            assertEq(balance, handler.received(i), "recipient differs from successful-payment oracle");
            recipientBalances += balance;
            oracleReceived += handler.received(i);
        }
        assertEq(oracleReceived, handler.totalPaid());
        assertEq(token.balanceOf(address(treasury)) + handler.totalPaid(), handler.totalFunded());
        assertEq(token.balanceOf(address(handler)) + handler.totalFunded(), 20_000 ether);
        assertEq(
            token.balanceOf(address(handler)) + token.balanceOf(address(treasury)) + recipientBalances, 20_000 ether
        );
        assertEq(token.totalSupply(), 20_000 ether);
    }

    function invariant_eachRequestSucceedsAtMostOnceAcrossRoleEpochs() public view {
        uint256 payments;
        for (uint256 i; i < handler.REQUEST_COUNT(); ++i) {
            uint256 count = handler.successfulPaymentsByRequest(i);
            assertLe(count, 1, "request succeeded twice");
            assertEq(treasury.paidRequests(bytes32(i)), count == 1, "paid flag differs from independent history");
            payments += count;
        }
        assertEq(payments, handler.successfulPayments());
        assertGe(payments, 1, "campaign must include a real payment");
    }

    function invariant_onlyCurrentlyAuthorizedActorsCanPay() public view {
        assertFalse(handler.unexpectedOutcome(), "payment result differs from authorization/accounting model");
        assertEq(handler.unauthorizedSuccesses(), 0, "unprivileged or revoked caller paid");
        for (uint256 i; i < handler.ACTOR_COUNT(); ++i) {
            assertEq(treasury.hasRole(treasury.SPENDER_ROLE(), handler.actor(i)), handler.expectedSpender(i));
            assertFalse(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), handler.actor(i)));
            assertEq(token.balanceOf(handler.actor(i)), 0, "BUD escaped recipient universe");
        }
    }

    function testPendingRequestSurvivesFundingAndSpenderEpochsWithoutReplay() public {
        // Request 1 first fails authorization, then funding, then revocation.
        handler.pay(1, 1, 1, 100 ether);
        handler.changeRole(1, 0);
        handler.pay(1, 1, 1, 1_000 ether);
        handler.changeRole(1, 1);
        handler.fund(1_000 ether);
        handler.pay(1, 1, 2, 1_000 ether);
        assertEq(handler.successfulPaymentsByRequest(1), 0);
        assertFalse(treasury.paidRequests(bytes32(uint256(1))));

        // A different authorized actor can execute that still-pending ID.
        handler.changeRole(2, 0);
        handler.pay(2, 1, 2, 1_000 ether);
        handler.changeRole(2, 2);
        handler.pay(2, 2, 3, 100 ether);
        handler.changeRole(1, 0);
        // Re-granting a former spender cannot replay another spender's payment.
        handler.pay(1, 1, 3, 50 ether);
        handler.pay(1, 2, 3, 900 ether);

        assertEq(handler.successfulPayments(), 3);
        assertEq(handler.rejectedPayments(), 5);
        assertEq(handler.unauthorizedAttempts(), 3);
        assertEq(handler.totalFunded(), 2_000 ether);
        assertEq(handler.totalPaid(), 2_000 ether);
        assertEq(token.balanceOf(handler.recipient(0)), 100 ether);
        assertEq(token.balanceOf(handler.recipient(1)), 0);
        assertEq(token.balanceOf(handler.recipient(2)), 1_000 ether);
        assertEq(token.balanceOf(handler.recipient(3)), 900 ether);
        assertEq(token.balanceOf(address(treasury)), 0);
        invariant_accountingMatchesSuccessfulPaymentOracle();
        invariant_eachRequestSucceedsAtMostOnceAcrossRoleEpochs();
        invariant_onlyCurrentlyAuthorizedActorsCanPay();
    }
}
