// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {SecretMarketplace} from "../../src/SecretMarketplace.sol";

contract ForceCloseAuction is Script {
    function run() external {
        address auctionAddress = vm.envAddress("SECRET_MARKETPLACE_ADDRESS");
        uint256 auctionId = vm.envUint("AUCTION_ID");
        uint8 marketOutcome = uint8(vm.envUint("MARKET_OUTCOME")); // 1=No, 2=Yes, 3=Inconclusive
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPk);

        SecretMarketplace(auctionAddress).forceCloseAuction(auctionId, marketOutcome);
        console.log("Auction force closed:", auctionId);

        vm.stopBroadcast();
    }
}
