/*
NOTE TO CLAUDE: This code relates to the old CRE based system. It's being kept in until you've confirmed the Zama port works end to end. You can use it as reference for how the old system used to work, but you should not update or maintain these files.
*/
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";
import {ConfidentialUSDC} from "../src/ConfidentialUSDC.sol";

contract MintConfidentialUSDC is Script {
    function run() external {
        address usdcAddr = vm.envAddress("CONFIDENTIAL_USDC_ADDRESS");
        address owner = 0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5;
        address tester = 0x55D234274608a69a3E84c8Bc5Cd07F8A5f0f69Ce;
        uint256 amount = 10_000_000_000; // 10,000 ConfidentialUSDC (6 decimals)

        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPk);

        ConfidentialUSDC(usdcAddr).mint(owner, amount);
        ConfidentialUSDC(usdcAddr).mint(tester, amount);

        vm.stopBroadcast();
    }
}
