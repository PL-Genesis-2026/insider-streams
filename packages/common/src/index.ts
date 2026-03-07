// Shared constants, utilities, and generated ABIs for private-streams
export {
  examplePredictionMarketAbi,
  mockUsdcAbi,
  secretMarketplaceAbi,
} from "./__generated__/contract-types";

export type { Database } from "./__generated__/supabase-types";

// Deployed contract addresses (Eth Sepolia)
// NOTE: Update these when new contracts are deployed.
export const MOCK_USDC_ADDRESS =
  "0x1B69F56bEC6978D0B62C3f5612019cC6b72D6F7f" as const;
export const MOCK_USDC_DECIMALS = 6 as const;
export const SIMPLE_MARKET_ADDRESS =
  "0xAE7167747c7f50ed26125c4fFa48DD7d4c18aF0d" as const;
export const SECRET_MARKETPLACE_ADDRESS =
  "0x8221Ef6351c2CA9Ae3Ae65266076f3E14279F52a" as const;

export const VAULT_ADDRESS =
  "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13" as const;
