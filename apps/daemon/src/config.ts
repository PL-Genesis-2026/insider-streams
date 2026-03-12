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

  // Ntfy notifications
  ntfyEnabled: process.env.NTFY_ENABLED !== "false",
  ntfyHost: process.env.NTFY_HOST || "https://api.insider-streams.com",
  ntfyTopic: process.env.NTFY_TOPIC || "private-streams-daemon",
  ntfyUser: process.env.NTFY_USER || "daemon",

  // Polling intervals
  auctionCloserIntervalMs: Number(process.env.AUCTION_CLOSER_INTERVAL_MS || 30_000),
  reputationResolverIntervalMs: Number(process.env.REPUTATION_RESOLVER_INTERVAL_MS || 60_000),
  // HTTP API
  apiPort: Number(process.env.API_PORT || 3001),

  // SQLite
  dbPath: process.env.DB_PATH || "",

  // Demo populator (opt-in)
  demoMode: process.env.DEMO_MODE === "true",
  veniceApiKey: process.env.VENICE_API_KEY || "",
  subgraphUrl: process.env.SUBGRAPH_URL ||
    "https://api.studio.thegraph.com/query/1743303/insider-streams-zama/version/latest",
} as const;

export function requireConfig(keys: (keyof typeof config)[]): void {
  for (const key of keys) {
    if (!config[key]) {
      throw new Error(`Missing required config: ${key}. Set it in .env`);
    }
  }
}
