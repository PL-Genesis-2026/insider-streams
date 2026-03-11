/*
NOTE TO CLAUDE: This code relates to the old CRE based system. It's being kept in until you've confirmed the Zama port works end to end. You can use it as reference for how the old system used to work, but you should not update or maintain these files.
*/
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {SecretMarketplace} from "../src/SecretMarketplace.sol";

contract DeploySecretMarketplace is Script {
    function run() external {
        address token = vm.envAddress("CONFIDENTIAL_USDC_ADDRESS");
        address market = vm.envAddress("EXAMPLE_PREDICTION_MARKET_ADDRESS");
        address forwarder = vm.envAddress("CRE_FORWARDER_ADDRESS");
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPk);

        SecretMarketplace sm = new SecretMarketplace(token, market, forwarder);
        console.log("SecretMarketplace deployed at:", address(sm));

        vm.stopBroadcast();
    }
}
