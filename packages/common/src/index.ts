// Shared constants, utilities, and generated ABIs for private-streams
export {
  mockUsdcAbi,
  secretMarketplaceAbi,
  examplePredictionMarketAbi,
} from "./__generated__/contract-types";

export type { Database } from "./__generated__/supabase-types";

// Deployed contract addresses (Eth Sepolia)
// NOTE: Update these when new contracts are deployed.
export const MOCK_USDC_ADDRESS =
  "0x1B69F56bEC6978D0B62C3f5612019cC6b72D6F7f" as const;
export const MOCK_USDC_DECIMALS = 6 as const;
export const SIMPLE_MARKET_ADDRESS =
  "0x6b3b925114CfE8DF93Da3225cD75ee2087994c1d" as const;
export const SECRET_MARKETPLACE_ADDRESS =
  "0x81c9870dCd9B7e5E8b6EcF5d508c5f6BEE7DE058" as const;
