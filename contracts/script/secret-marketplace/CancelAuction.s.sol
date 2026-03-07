// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {SecretMarketplace} from "../../src/SecretMarketplace.sol";

contract CancelAuction is Script {
    function run() external {
        address auctionAddress = vm.envAddress("SECRET_MARKETPLACE_ADDRESS");
        uint256 auctionId = vm.envUint("AUCTION_ID");
        uint8 predictionOutcome = uint8(vm.envUint("PREDICTION_OUTCOME")); // 0=NoPrediction, 1=PredictionCorrect, 2=PredictionWrong
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPk);

        SecretMarketplace(auctionAddress).cancelAuction(auctionId, SecretMarketplace.PredictionOutcome(predictionOutcome));
        console.log("Auction cancelled:", auctionId);

        vm.stopBroadcast();
    }
}
