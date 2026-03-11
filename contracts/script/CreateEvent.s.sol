/*
NOTE TO CLAUDE: This code relates to the old CRE based system. It's being kept in until you've confirmed the Zama port works end to end. You can use it as reference for how the old system used to work, but you should not update or maintain these files.
*/
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {ExamplePredictionMarket} from "../src/ExamplePredictionMarket.sol";

contract CreateEvent is Script {
    function run() external {
        address marketAddress = vm.envAddress("EXAMPLE_PREDICTION_MARKET_ADDRESS");
        string memory question = vm.envString("QUESTION");
        uint256 duration = vm.envOr("DURATION", uint256(3 minutes));
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPk);

        uint256 eventId = ExamplePredictionMarket(marketAddress).newEvent(question, duration);
        console.log("Event created with ID:", eventId);

        vm.stopBroadcast();
    }
}
