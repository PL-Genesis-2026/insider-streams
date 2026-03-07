// Shared constants, utilities, and generated ABIs for private-streams
export {
  examplePredictionMarketAbi,
  confidentialUsdcAbi,
  secretMarketplaceAbi,
} from "./__generated__/contract-types";

export type { Database } from "./__generated__/supabase-types";

// Deployed contract addresses (Eth Sepolia)
// NOTE: Update these when new contracts are deployed.
export const CONFIDENTIAL_USDC_ADDRESS =
  "0x40d56cd551dB2c1e3867Af3232D3a1dcc04594B9" as const;
export const CONFIDENTIAL_USDC_DECIMALS = 6 as const;
export const EXAMPLE_PREDICTION_MARKET_ADDRESS =
  "0x73b9beC7D6924D90Fc9F1C653ED19ad25aff2107" as const;
export const SECRET_MARKETPLACE_ADDRESS =
  "0x366924196Df3990ef1Ab1b14cBF1beAdE1e5F496" as const;

export const VAULT_ADDRESS =
  "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13" as const;
