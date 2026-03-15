import "dotenv/config";
import {
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  SECRET_MARKETPLACE_ADDRESS,
  CONFIDENTIAL_USDC_ADDRESS,
} from "@private-streams/common";

export const config = {
  // Chain
  rpcUrl: process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  privateKey: process.env.PRIVATE_KEY || "",
  chainId: 11155111,

  // Contracts — imported from @private-streams/common (single source of truth)
  predictionMarketAddress: EXAMPLE_PREDICTION_MARKET_ADDRESS,
  secretMarketplaceAddress: SECRET_MARKETPLACE_ADDRESS,
  confidentialUsdcAddress: CONFIDENTIAL_USDC_ADDRESS,

  // Gemini AI
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite-preview",

  // Firebase (audit trail)
  firebaseApiKey: process.env.FIREBASE_API_KEY || "",
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",

  // Ntfy notifications — per-service topics
  ntfyEnabled: process.env.NTFY_ENABLED !== "false",
  ntfyHost: process.env.NTFY_HOST || "https://api.insider-streams.com",
  ntfyUser: process.env.NTFY_USER || "daemon",
  ntfyTopicSettler: process.env.NTFY_TOPIC_SETTLER || "zama-settler",
  ntfyTopicCloser: process.env.NTFY_TOPIC_AUCTION_CLOSER || "zama-auction-closer",
  ntfyTopicReputation: process.env.NTFY_TOPIC_REPUTATION_RESOLVER || "zama-reputation-resolver",

  // Polling intervals
  auctionCloserIntervalMs: Number(process.env.AUCTION_CLOSER_INTERVAL_MS || 30_000),
  // HTTP API
  apiPort: Number(process.env.API_PORT || 3001),

  // SQLite
  dbPath: process.env.DB_PATH || "",

  // Frontend URLs (for ntfy click links)
  frontendUrl: process.env.FRONTEND_URL || "",

  // Filecoin
  filecoinWalletPrivateKey: process.env.FILECOIN_WALLET_PRIVATE_KEY || process.env.PRIVATE_KEY || "",
  filecoinRpcUrl: process.env.FILECOIN_RPC_URL || "",
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 10_485_760), // 10 MB

} as const;

export function requireConfig(keys: (keyof typeof config)[]): void {
  for (const key of keys) {
    if (!config[key]) {
      throw new Error(`Missing required config: ${key}. Set it in .env`);
    }
  }
}
