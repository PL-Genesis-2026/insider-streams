/**
 * Event Watcher — long-running process that polls the chain and triggers
 * CRE workflows when relevant events occur.
 *
 * Watchers:
 *   1. force-close:    AuctionForceClosed events → force-close-handler CRE
 *   2. settlement:     SettlementRequested events → external-prediction-market-settler CRE
 *   3. auction-expiry: getOpenAuctions() polling  → secret-marketplace-auction-closer CRE
 *
 * Usage: pnpm watch   (or: npx tsx event-watcher/index.ts)
 *
 * Env: RPC_URL (optional, defaults to public Sepolia RPC)
 */

import "dotenv/config";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { loadState, saveState } from "./state.js";
import { pollForceCloseEvents } from "./force-close-watcher.js";
import { pollSettlementEvents } from "./settlement-watcher.js";
import { pollExpiredAuctions } from "./auction-expiry-watcher.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const LOG_POLL_INTERVAL_MS = 15_000;   // 15s for log-based watchers
const EXPIRY_POLL_INTERVAL_MS = 30_000; // 30s for auction expiry checks
const CONFIRMATION_BLOCKS = 2n;         // wait 2 blocks for finality

// ─── Logging ─────────────────────────────────────────────────────────────────

export function log(watcher: string, msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${watcher}] ${msg}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

let lastProcessedBlock: bigint;
let logPollTimer: ReturnType<typeof setInterval>;
let expiryPollTimer: ReturnType<typeof setInterval>;
let shuttingDown = false;

async function init(): Promise<void> {
  const state = loadState();
  if (state) {
    lastProcessedBlock = BigInt(state.lastProcessedBlock);
    log("main", `Resuming from block ${lastProcessedBlock} (state file)`);
  } else {
    const block = await publicClient.getBlockNumber();
    lastProcessedBlock = block;
    log("main", `Starting fresh from current block ${lastProcessedBlock}`);
    saveState(Number(lastProcessedBlock));
  }
}

async function pollLogs(): Promise<void> {
  if (shuttingDown) return;

  try {
    const latestBlock = await publicClient.getBlockNumber();
    const safeBlock = latestBlock - CONFIRMATION_BLOCKS;

    if (safeBlock <= lastProcessedBlock) return;

    const fromBlock = lastProcessedBlock + 1n;
    const toBlock = safeBlock;

    // Poll both event types in the same cycle
    await pollForceCloseEvents(publicClient, fromBlock, toBlock);
    await pollSettlementEvents(publicClient, fromBlock, toBlock);

    lastProcessedBlock = toBlock;
    saveState(Number(toBlock));
  } catch (err) {
    log("main", `Log poll error (will retry): ${err}`);
  }
}

async function pollExpiry(): Promise<void> {
  if (shuttingDown) return;

  try {
    await pollExpiredAuctions(publicClient);
  } catch (err) {
    log("main", `Auction expiry poll error (will retry): ${err}`);
  }
}

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log("main", "Shutting down...");
  clearInterval(logPollTimer);
  clearInterval(expiryPollTimer);
  saveState(Number(lastProcessedBlock));
  log("main", `State saved at block ${lastProcessedBlock}. Goodbye.`);
  process.exit(0);
}

async function main(): Promise<void> {
  log("main", "╔══════════════════════════════════════════╗");
  log("main", "║     Private Streams Event Watcher        ║");
  log("main", "╚══════════════════════════════════════════╝");
  log("main", `RPC: ${RPC_URL}`);
  log("main", `Log poll interval: ${LOG_POLL_INTERVAL_MS / 1000}s`);
  log("main", `Expiry poll interval: ${EXPIRY_POLL_INTERVAL_MS / 1000}s`);
  log("main", `Confirmation blocks: ${CONFIRMATION_BLOCKS}`);

  await init();

  // Run once immediately, then on interval
  await pollLogs();
  await pollExpiry();

  logPollTimer = setInterval(pollLogs, LOG_POLL_INTERVAL_MS);
  expiryPollTimer = setInterval(pollExpiry, EXPIRY_POLL_INTERVAL_MS);

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  log("main", "Watcher running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  log("main", `Fatal error: ${err}`);
  process.exit(1);
});
