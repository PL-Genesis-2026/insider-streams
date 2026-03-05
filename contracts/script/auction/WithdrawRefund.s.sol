// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {Auction} from "../../src/Auction.sol";

contract WithdrawRefund is Script {
    function run() external {
        address auctionAddress = vm.envAddress("AUCTION_ADDRESS");
        uint256 bidderPk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(bidderPk);

        Auction(auctionAddress).withdrawRefund();
        console.log("Refund withdrawn");

        vm.stopBroadcast();
    }
}
