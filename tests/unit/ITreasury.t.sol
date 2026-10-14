// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ITreasury} from "../../contracts/interfaces/ITreasury.sol";

contract ITreasuryTest is Test {
    // The selector is the 4-byte identifier the EVM uses to dispatch a function call.
    function testDisburseSelector() public pure {
        // Hash the function signature; its first 4 bytes form the selector.
        bytes4 expected = bytes4(keccak256("disburse(bytes32,address,uint256)"));

        // Passes only if the interface selector matches the expected selector.
        assertTrue(ITreasury.disburse.selector == expected);
    }
}
