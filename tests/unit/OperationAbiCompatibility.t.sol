// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ITreasury} from "../../contracts/interfaces/ITreasury.sol";

contract OperationAbiCompatibilityTest is Test {
    function testFuzzDisbursementPayloadMatchesClientAbi(bytes32 requestId, address recipient, uint256 amount)
        public
        pure
    {
        // Client-side ABI values must remain compatible with the compiled interface.
        bytes memory clientPayload = abi.encodeWithSelector(bytes4(0x6664ac91), requestId, recipient, amount);
        bytes memory contractPayload = abi.encodeCall(ITreasury.disburse, (requestId, recipient, amount));

        assertEq(contractPayload, clientPayload, "Treasury calldata is incompatible with operation clients");
    }

    function testBudgetDisbursedTopicMatchesIndexerAbi() public pure {
        // Pin the public topic independently of the interface for indexer compatibility.
        bytes32 indexerTopic = 0xed831073041168fde3787985861235c1f42621a21918a64a309a17903e0e10db;

        assertEq(ITreasury.BudgetDisbursed.selector, indexerTopic, "Disbursement event topic changed");
    }
}
