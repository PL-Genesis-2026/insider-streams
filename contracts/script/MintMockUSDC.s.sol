// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {MockUSDC} from "../src/mock/MockUSDC.sol";

contract MintMockUSDC is Script {
    function run() external {
        address mockUSDC = vm.envAddress("MOCK_USDC_ADDRESS");
        address owner = 0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5;
        address tester = 0x55D234274608a69a3E84c8Bc5Cd07F8A5f0f69Ce;
        uint256 amount = 10_000_000_000; // 10,000 MockUSDC (6 decimals)

        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPk);

        MockUSDC(mockUSDC).mint(owner, amount);
        MockUSDC(mockUSDC).mint(tester, amount);

        vm.stopBroadcast();
    }
}
