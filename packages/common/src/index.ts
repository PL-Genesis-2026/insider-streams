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
  "0xA75c910D441C99bA651a70451D3bE1d690c1DD85" as const;
export const MOCK_USDC_DECIMALS = 6 as const;
export const SIMPLE_MARKET_ADDRESS =
  "0x89F02f5a5162570F1a79C5C505b6CA78D13229e7" as const;
export const SECRET_MARKETPLACE_ADDRESS =
  "0x197D1150858Ce0c125B69E02D80790D7e7b017f1" as const;
