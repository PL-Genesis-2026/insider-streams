// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {SecretMarketplace} from "../../src/SecretMarketplace.sol";

contract CloseAuction is Script {
    function run() external {
        address auctionAddress = vm.envAddress("AUCTION_ADDRESS");
        uint256 auctionId = vm.envUint("AUCTION_ID");
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPk);

        SecretMarketplace(auctionAddress).closeAuction(auctionId);
        console.log("Auction closed:", auctionId);

        vm.stopBroadcast();
    }
}
