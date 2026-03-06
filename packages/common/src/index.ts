// Shared constants, utilities, and generated ABIs for private-streams
export {
  mockUsdcAbi,
  secretMarketplaceAbi,
  // After running `pnpm wagmi`, this will export `examplePredictionMarketAbi`.
  // Until then, re-export the old name as an alias.
  simpleMarketAbi as examplePredictionMarketAbi,
} from "./generated";

export type { Database } from "./__generated__/supabase-types";

// Deployed contract addresses (Eth Sepolia)
// NOTE: Update these when new contracts are deployed.
export const MOCK_USDC_ADDRESS =
  "0xA75c910D441C99bA651a70451D3bE1d690c1DD85" as const;
export const MOCK_USDC_DECIMALS = 6 as const;
export const SIMPLE_MARKET_ADDRESS =
  "0x89F02f5a5162570F1a79C5C505b6CA78D13229e7" as const;
export const SECRET_MARKETPLACE_ADDRESS =
  "0xda55F6bc945CCA8A92e938c05bba58B934892a3c" as const;
