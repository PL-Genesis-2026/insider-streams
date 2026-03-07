// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {ExamplePredictionMarket} from "../src/ExamplePredictionMarket.sol";

contract DeployExamplePredictionMarket is Script {
    function run() external {
        address token = vm.envAddress("MOCK_USDC_ADDRESS");
        address forwarder = vm.envAddress("CRE_FORWARDER_ADDRESS");
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPk);

        ExamplePredictionMarket market = new ExamplePredictionMarket(token, forwarder);
        console.log("ExamplePredictionMarket deployed at:", address(market));

        vm.stopBroadcast();
    }
}
