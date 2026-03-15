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

import { config, requireConfig } from "./config.js";
import { startSettler } from "./settler.js";
import { startAuctionCloser } from "./auction-closer.js";
import { startReputationResolver } from "./reputation-resolver.js";
import { startApi } from "./api.js";

async function main() {
  const mode = config.daemonMode;
  console.log("=== Private Streams Daemon ===");
  console.log(`Mode: ${mode}`);
  console.log(`RPC: ${config.rpcUrl}`);
  console.log(`Prediction Market: ${config.predictionMarketAddress}`);
  console.log(`Secret Marketplace: ${config.secretMarketplaceAddress}`);
  if (mode !== "workers") {
    console.log(`API Port: ${config.apiPort}`);
  }
  console.log("");

  const services: Promise<void>[] = [];

  // Start background workers (settler, closer, resolver) in "workers" or "all" mode
  if (mode === "workers") {
    requireConfig(["apiInternalUrl", "internalApiKey"]);
  }
  if (mode === "workers" || mode === "all") {
    if (config.geminiApiKey) {
      services.push(startSettler());
    } else {
      console.log("[daemon] Settler disabled — missing GEMINI_API_KEY");
    }

    services.push(startAuctionCloser());
    services.push(startReputationResolver());
  }

  // Start HTTP API in "api" or "all" mode
  if (mode === "api" || mode === "all") {
    startApi();
  }

  if (services.length === 0 && mode !== "api") {
    console.warn("[daemon] No background services configured.");
  }

  if (services.length > 0) {
    const results = await Promise.allSettled(services);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      for (const f of failed) {
        console.error("[daemon] Service startup failed:", (f as PromiseRejectedResult).reason);
      }
    }
  }

  console.log(`\n[daemon] Started in ${mode} mode. Press Ctrl+C to stop.`);
}

main().catch((err) => {
  console.error("[daemon] Fatal error:", err);
  process.exit(1);
});
