/**
 * Private Streams Daemon — Unified Entry Point
 *
 * Runs all automation services:
 * 1. Settler — watches SettlementRequested, calls Gemini AI, settles on-chain
 * 2. Auction Closer — polls for expired auctions, closes them
 * 3. Reputation Resolver — watches SettlementResponse, resolves predictions
 * 4. HTTP API — frontend proxy for bids, auctions, withdrawals
 *
 * Can also run individual services via:
 *   pnpm settler / pnpm closer / pnpm resolver / pnpm api
 */

import { config } from "./config.js";
import { startSettler } from "./settler.js";
import { startAuctionCloser } from "./auction-closer.js";
import { startReputationResolver } from "./reputation-resolver.js";
import { startApi } from "./api.js";
import { startDemoPopulator } from "./demo-populator.js";

async function main() {
  console.log("=== Private Streams Daemon ===");
  console.log(`RPC: ${config.rpcUrl}`);
  console.log(`Prediction Market: ${config.predictionMarketAddress}`);
  console.log(`Secret Marketplace: ${config.secretMarketplaceAddress}`);
  console.log(`API Port: ${config.apiPort}`);
  console.log("");

  const services: Promise<void>[] = [];

  // Start settler if Gemini API key is configured
  if (config.geminiApiKey) {
    services.push(startSettler());
  } else {
    console.log("[daemon] Settler disabled — missing GEMINI_API_KEY");
  }

  // Start auction closer
  services.push(startAuctionCloser());

  // Start reputation resolver
  services.push(startReputationResolver());

  // Start demo populator if enabled
  if (config.demoMode) {
    services.push(startDemoPopulator());
  } else {
    console.log("[daemon] Demo populator disabled — set DEMO_MODE=true to enable");
  }

  // Always start HTTP API
  startApi();

  if (services.length === 0) {
    console.warn("[daemon] No background services configured. Only HTTP API is running.");
  }

  const results = await Promise.allSettled(services);
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    for (const f of failed) {
      console.error("[daemon] Service startup failed:", (f as PromiseRejectedResult).reason);
    }
  }

  console.log("\n[daemon] All services started. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("[daemon] Fatal error:", err);
  process.exit(1);
});
