// Shared constants, utilities, and generated ABIs for private-streams
export {
  mockUsdcAbi,
  secretMarketplaceAbi,
  simpleMarketAbi,
} from "./generated.js";

export type { Database } from "./__generated__/supabase-types.js";

// Deployed contract addresses (Eth Sepolia)
// NOTE: Update these when new contracts are deployed.
export const MOCK_USDC_ADDRESS =
  "0xA75c910D441C99bA651a70451D3bE1d690c1DD85" as const;
export const SIMPLE_MARKET_ADDRESS =
  "0x89F02f5a5162570F1a79C5C505b6CA78D13229e7" as const;
export const SECRET_MARKETPLACE_ADDRESS =
  "0x2B77E46F13c4f5B11B1df6C1aD0b37E0396EF736" as const;
