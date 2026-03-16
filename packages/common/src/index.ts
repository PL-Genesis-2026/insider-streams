// Shared constants, utilities, and generated ABIs for private-streams
export {
  fheConfidentialUsdcAbi,
  fheSecretMarketplaceAbi,
  examplePredictionMarketAbi,
  mockUsdcAbi,
  // Backward-compatible aliases (old Foundry contract names → new FHE contracts).
  // Consumers should migrate to fheConfidentialUsdcAbi / fheSecretMarketplaceAbi.
  fheConfidentialUsdcAbi as confidentialUsdcAbi,
  fheSecretMarketplaceAbi as secretMarketplaceAbi,
} from "./__generated__/contract-types";

export * from "./consts";
export * from "./create-auction";
export * from "./faucet";
export * from "./verify-signed-request";
export * from "./fhe";
