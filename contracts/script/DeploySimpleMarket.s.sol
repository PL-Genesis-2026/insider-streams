// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {SimpleMarket} from "../src/SimpleMarket.sol";

contract DeploySimpleMarket is Script {
    function run() external {
        address token = vm.envAddress("PAYMENT_TOKEN");
        address forwarder = vm.envAddress("CRE_FORWARDER_ADDRESS");
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPk);

        SimpleMarket market = new SimpleMarket(token, forwarder);
        console.log("SimpleMarket deployed at:", address(market));

        vm.stopBroadcast();
    }
}
