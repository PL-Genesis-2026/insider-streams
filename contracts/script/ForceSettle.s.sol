// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {ExamplePredictionMarket} from "../src/ExamplePredictionMarket.sol";

contract ForceSettle is Script {
    function run() external {
        address marketAddress = vm.envAddress("EXAMPLE_PREDICTION_MARKET_ADDRESS");
        uint256 eventId = vm.envUint("EVENT_ID");
        uint8 outcome = uint8(vm.envUint("OUTCOME")); // 1=No, 2=Yes
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPk);

        ExamplePredictionMarket(marketAddress).forceSettle(
            eventId,
            ExamplePredictionMarket.Outcome(outcome),
            uint16(10000), // 100% confidence
            "force-settled"
        );
        console.log("Force-settled event:", eventId);

        vm.stopBroadcast();
    }
}
