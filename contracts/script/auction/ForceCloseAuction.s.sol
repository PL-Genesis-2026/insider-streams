// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {Auction} from "../../src/Auction.sol";

contract ForceCloseAuction is Script {
    function run() external {
        address auctionAddress = vm.envAddress("AUCTION_ADDRESS");
        uint256 auctionId = vm.envUint("AUCTION_ID");
        int8 reputationDelta = int8(int256(vm.envInt("REPUTATION_DELTA"))); // 1, -1, or 0
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPk);

        Auction(auctionAddress).forceCloseAuction(auctionId, reputationDelta);
        console.log("Auction force closed:", auctionId);

        vm.stopBroadcast();
    }
}
