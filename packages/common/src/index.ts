// Shared constants, utilities, and generated ABIs for private-streams
export {
  mockUsdcAbi,
  secretMarketplaceAbi,
  simpleMarketAbi,
} from "./generated";

export type { Database } from "./__generated__/supabase-types";

// Deployed contract addresses (Eth Sepolia)
// NOTE: Update these when new contracts are deployed.
export const MOCK_USDC_ADDRESS =
  "0x2aD4A3782b1C323E6F6aEE51584e83818e8befda" as const;
export const MOCK_USDC_DECIMALS = 6 as const;
export const SIMPLE_MARKET_ADDRESS =
  "0x1cDDd36691bc9a55AD59b177fcF79FCF4F42Eba2" as const;
export const SECRET_MARKETPLACE_ADDRESS =
  "0x65c44b9C025F9482Cc9B473efAd8301F6E780E08" as const;

// Compliant Private Token addresses (Eth Sepolia)
export const SIMPLE_TOKEN_ADDRESS =
  "0xB308Ef20527c5215ec2B2B10F52b311f3AAc6EEB" as const;
export const POLICY_ENGINE_ADDRESS =
  "0xb208a00A90839246C9f6008EaDD71177e78D4EA1" as const;
export const VAULT_ADDRESS =
  "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13" as const;
