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
  ntfyTopicCreateEvents: process.env.NTFY_TOPIC_CREATE_EVENTS || "zama-create-events",
  ntfyTopicSpawnAuctions: process.env.NTFY_TOPIC_SPAWN_AUCTIONS || "zama-spawn-auctions",
  ntfyTopicPlaceBids: process.env.NTFY_TOPIC_PLACE_BIDS || "zama-place-bids",
  ntfyTopicSettlements: process.env.NTFY_TOPIC_SETTLEMENTS || "zama-settlements",

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
  // Subgraph — prod gateway URL. Set SUBGRAPH_API_KEY for Bearer auth.
  subgraphUrl: process.env.SUBGRAPH_URL ||
    "https://gateway.thegraph.com/api/subgraphs/id/BttcQ7pVTEz7L94PgnhkFJCY33K5Vwk1vhffckmjgf5f",
  subgraphApiKey: process.env.SUBGRAPH_API_KEY || "a075bc6e2e48577d2588bb458b939bdc",
} as const;

export function requireConfig(keys: (keyof typeof config)[]): void {
  for (const key of keys) {
    if (!config[key]) {
      throw new Error(`Missing required config: ${key}. Set it in .env`);
    }
  }
}
