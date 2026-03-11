import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import type { HardhatUserConfig } from "hardhat/config";
import { vars } from "hardhat/config";
import "solidity-coverage";
import "dotenv/config";

import "./tasks/accounts";
import "./tasks/FHECounter";

const MNEMONIC: string = vars.get("MNEMONIC", "test test test test test test test test test test test junk");

// Use PRIVATE_KEY from .env for Sepolia deployments, fall back to mnemonic
const PRIVATE_KEY: string | undefined = process.env.PRIVATE_KEY;
const TESTER_PK: string | undefined = process.env.TESTER_PK;
const RPC_URL: string = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

// Build Sepolia accounts array: deployer + optional tester
const sepoliaAccounts: string[] | { mnemonic: string } = PRIVATE_KEY
  ? TESTER_PK ? [PRIVATE_KEY, TESTER_PK] : [PRIVATE_KEY]
  : { mnemonic: MNEMONIC };

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: 0,
  },
  etherscan: {
    apiKey: vars.get("ETHERSCAN_API_KEY", ""),
  },
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic: MNEMONIC,
      },
      chainId: 31337,
    },
    sepolia: {
      accounts: sepoliaAccounts,
      chainId: 11155111,
      url: RPC_URL,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.27",
    settings: {
      metadata: {
        bytecodeHash: "none",
      },
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 800,
      },
      evmVersion: "cancun",
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
