// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {SecretMarketplace} from "../../src/SecretMarketplace.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PlaceBid is Script {
    function run() external {
        address auctionAddress = vm.envAddress("SECRET_MARKETPLACE_ADDRESS");
        address tokenAddress = vm.envAddress("MOCK_USDC_ADDRESS");
        uint256 auctionId = vm.envUint("AUCTION_ID");
        uint256 bidAmount = vm.envUint("BID_AMOUNT");
        uint256 bidderPk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(bidderPk);

        IERC20(tokenAddress).approve(auctionAddress, bidAmount);
        SecretMarketplace(auctionAddress).placeBid(auctionId, bidAmount);
        console.log("Bid placed on auction", auctionId, "for", bidAmount);

        vm.stopBroadcast();
    }
}
