// Shared constants, utilities, and generated ABIs for private-streams
export {
  confidentialUsdcAbi,
  examplePredictionMarketAbi,
  secretMarketplaceAbi,
} from "./__generated__/contract-types";

export type { Database } from "./__generated__/supabase-types";

// Deployed contract addresses (Eth Sepolia)
// NOTE: Update these when new contracts are deployed.

// This is the CLEAR/Non-private CONFIDENTIAL_USDC address, can't be used for private transfers.
// It's used in ExamplePredictionMarket and tests that run against ExternalPredictionMarket
export const CONFIDENTIAL_USDC_ADDRESS =
  "0xee3A0Cccb31fF816615C18E1d1DB480df8a0f9F1" as const;

// ConfidentialUSDC instance registered with the vault for private transfers.
// This is a separate deployment from CONFIDENTIAL_USDC_ADDRESS (used by the marketplace, frontend, any interaction with the CCC REST API).
export const PRIVATE_CONFIDENTIAL_USDC_ADDRESS =
  "0x38EDa3F7b7649CE3f8534C59a40132bE347E750A" as const;

export const CONFIDENTIAL_USDC_DECIMALS = 6 as const;
export const EXAMPLE_PREDICTION_MARKET_ADDRESS =
  "0x83B1F9d683b1a760569C237Bfb89C50112c05e24" as const;
export const SECRET_MARKETPLACE_ADDRESS =
  "0x8e99C312489f64D2C94B611A9d8f28A7566cb42D" as const;

// Vault for private transfers, owned by chainlink, this address will not change through the entire hackaton
export const VAULT_ADDRESS =
  "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13" as const;
