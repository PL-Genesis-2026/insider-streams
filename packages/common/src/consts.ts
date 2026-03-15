// Deployed contract addresses (Eth Sepolia)
// NOTE: Update these when new contracts are deployed.
// All contracts deployed via: cd contracts-fhe && npx hardhat deploy --network sepolia

// FHEConfidentialUSDC (ERC-7984) — encrypted payment token for the marketplace
export const CONFIDENTIAL_USDC_ADDRESS =
  "0x1f54Afd38756089cd2B8852e5014C6ccf1299b57" as const;

export const CONFIDENTIAL_USDC_DECIMALS = 6 as const;

// MockUSDC (plain ERC-20) — payment token for ExamplePredictionMarket
export const MOCK_USDC_ADDRESS =
  "0x1Cd05cf3c20Cd64f6803C1777C6373e47872944c" as const;

export const EXAMPLE_PREDICTION_MARKET_ADDRESS =
  "0x7C22C1b9B2a4575089a996E98c877b996eBbBAA2" as const;
export const EXAMPLE_PREDICTION_MARKET_NAME = "Bollymarket" as const;

export const SECRET_MARKETPLACE_ADDRESS =
  "0xf74884348F7153c63A46a1e362ec6D90E754Cf15" as const;

// Platform EOA — admin wallet that submits all on-chain txs
export const PLATFORM_EOA_ADDRESS =
  "0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5" as const;
