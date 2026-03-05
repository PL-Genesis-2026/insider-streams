// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {Auction} from "../../src/Auction.sol";

contract DeployAuction is Script {
    function run() external {
        address token = vm.envAddress("MOCK_USDC_ADDRESS");
        address market = vm.envAddress("SIMPLE_MARKET_ADDRESS");
        address forwarder = vm.envAddress("CRE_FORWARDER_ADDRESS");
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPk);

        Auction auction = new Auction(token, market, forwarder);
        console.log("Auction deployed at:", address(auction));

        vm.stopBroadcast();
    }
}
