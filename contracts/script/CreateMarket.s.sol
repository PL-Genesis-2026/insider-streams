// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {ExamplePredictionMarket} from "../src/ExamplePredictionMarket.sol";

contract CreateMarket is Script {
    function run() external {
        address marketAddress = vm.envAddress("SIMPLE_MARKET_ADDRESS");
        string memory question = vm.envString("QUESTION");
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPk);

        uint256 marketId = ExamplePredictionMarket(marketAddress).newMarket(question);
        console.log("Market created with ID:", marketId);

        vm.stopBroadcast();
    }
}
