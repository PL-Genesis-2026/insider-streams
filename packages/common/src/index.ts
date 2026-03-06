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

// Compliant Private Token addresses (Eth Sepolia)
export const SIMPLE_TOKEN_ADDRESS =
  "0xB308Ef20527c5215ec2B2B10F52b311f3AAc6EEB" as const;
export const POLICY_ENGINE_ADDRESS =
  "0xb208a00A90839246C9f6008EaDD71177e78D4EA1" as const;
export const VAULT_ADDRESS =
  "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13" as const;
