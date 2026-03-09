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
  "0xc0800a96EbfEEd4F7C9113C6D9D960d2D912004f" as const;
export const EXAMPLE_PREDICTION_MARKET_NAME = "Bollymarket" as const;
export const SECRET_MARKETPLACE_ADDRESS =
  "0x1f903548234b15C4d955Cce79beaaC853A98C514" as const;

// Vault for private transfers, owned by chainlink, this address will not change through the entire hackaton
export const VAULT_ADDRESS =
  "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13" as const;
