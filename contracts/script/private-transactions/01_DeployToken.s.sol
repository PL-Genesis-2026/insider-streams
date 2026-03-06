// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {ConfidentialUSDC} from "../../src/ConfidentialUSDC.sol";

/// @title DeployToken
/// @notice Deploys the ConfidentialUSDC ERC20 contract on Sepolia.
contract DeployToken is Script {
    function run() external {
        uint256 deployerPK = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPK);

        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPK);

        ConfidentialUSDC token = new ConfidentialUSDC("ConfidentialUSDC", "cUSDC", deployer);

        vm.stopBroadcast();

        console.log("------------------------------------");
        console.log("ConfidentialUSDC deployed at:", address(token));
        console.log("------------------------------------");
    }
}
