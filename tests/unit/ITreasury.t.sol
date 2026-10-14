
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ITreasury} from "../../contracts/interfaces/ITreasury.sol";

contract ITreasuryTest is Test {

    function testDisburseSelector() public pure {
        bytes4 expected = bytes4(
            keccak256("disburse(bytes32,address,uint256)")
        );

        assertTrue(
            ITreasury.disburse.selector == expected
        );
    }
}
