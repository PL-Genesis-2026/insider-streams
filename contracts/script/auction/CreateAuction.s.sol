// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {SecretMarketplace} from "../../src/SecretMarketplace.sol";

contract CreateAuction is Script {
    function run() external {
        address auctionAddress = vm.envAddress("AUCTION_ADDRESS");
        uint256 externalMarketId = vm.envUint("EXTERNAL_MARKET_ID");
        uint256 reservePrice = vm.envUint("RESERVE_PRICE");
        uint256 duration = vm.envUint("AUCTION_DURATION"); // seconds from now
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        uint256 endTime = block.timestamp + duration;

        vm.startBroadcast(deployerPk);

        uint256 auctionId = SecretMarketplace(auctionAddress).createAuction(externalMarketId, reservePrice, endTime);
        console.log("Auction created with ID:", auctionId);

        vm.stopBroadcast();
    }
}
