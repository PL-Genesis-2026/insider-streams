// Deployed contract addresses (Eth Sepolia)
// NOTE: Update these when new contracts are deployed.

// FHEConfidentialUSDC (ERC-7984) — payment token for the marketplace
export const CONFIDENTIAL_USDC_ADDRESS =
  "0xee3A0Cccb31fF816615C18E1d1DB480df8a0f9F1" as const;

// ConfidentialUSDC instance registered with the vault for private transfers.
// This is a separate deployment from CONFIDENTIAL_USDC_ADDRESS (used by the marketplace, frontend, any interaction with the CCC REST API).
export const PRIVATE_CONFIDENTIAL_USDC_ADDRESS =
  "0x38EDa3F7b7649CE3f8534C59a40132bE347E750A" as const;

export const CONFIDENTIAL_USDC_DECIMALS = 6 as const;
export const EXAMPLE_PREDICTION_MARKET_ADDRESS =
  "0x791550c705B2272E1D6EC617AB18337f4E5712E8" as const;
export const EXAMPLE_PREDICTION_MARKET_NAME = "Bollymarket" as const;
export const SECRET_MARKETPLACE_ADDRESS =
  "0x0056F94eCC59B918a225B433401EE5121506171B" as const;

// Vault for private transfers, owned by chainlink, this address will not change through the entire hackaton
export const VAULT_ADDRESS =
  "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13" as const;

// Platform EOA — owner wallet that receives private transfers (deposit activation)
export const PLATFORM_EOA_ADDRESS =
  "0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5" as const;
