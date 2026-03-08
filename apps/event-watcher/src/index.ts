/**
 * Event Watcher — long-running process that subscribes to on-chain events
 * via WebSocket and triggers CRE workflows in real-time.
 *
 * Watchers:
 *   1. force-close:    AuctionCancelled events → force-close-handler CRE  (WebSocket)
 *   2. settlement:     SettlementRequested events → external-prediction-market-settler CRE  (WebSocket)
 *   3. auction-expiry: getOpenAuctions() polling  → secret-marketplace-auction-closer CRE  (HTTP poll)
 *
 * On startup, catches up from lastProcessedBlock using getLogs (HTTP), then
 * switches to real-time WebSocket subscriptions. The auction-expiry watcher
 * always uses HTTP polling since there's no event to subscribe to.
 *
 * Usage: pnpm start   (from apps/event-watcher/)
 *
 * Env: RPC_URL (optional, defaults to public Sepolia RPC)
 */

import "dotenv/config";
import { createPublicClient, http, webSocket } from "viem";
import { sepolia } from "viem/chains";
import { loadState, saveState } from "./state.js";
import { catchUpForceClose, watchForceClose } from "./force-close-watcher.js";
import { catchUpSettlement, watchSettlement } from "./settlement-watcher.js";
import { pollExpiredAuctions } from "./auction-expiry-watcher.js";
import { notify } from "./notify.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const HTTP_RPC_URL = process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const WS_RPC_URL = HTTP_RPC_URL.replace("https://", "wss://").replace("http://", "ws://");
const EXPIRY_POLL_INTERVAL_MS = 30_000; // 30s for auction expiry checks

// ─── Logging ─────────────────────────────────────────────────────────────────

export function log(watcher: string, msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${watcher}] ${msg}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const httpClient = createPublicClient({
  chain: sepolia,
  transport: http(HTTP_RPC_URL),
});

const wsClient = createPublicClient({
  chain: sepolia,
  transport: webSocket(WS_RPC_URL, { retryCount: 10, retryDelay: 5_000 }),
});

let expiryPollTimer: ReturnType<typeof setInterval>;
let unwatchForceClose: (() => void) | undefined;
let unwatchSettlement: (() => void) | undefined;
let shuttingDown = false;

async function catchUp(): Promise<void> {
  const state = loadState();
  const latestBlock = await httpClient.getBlockNumber();

  if (state) {
    const fromBlock = BigInt(state.lastProcessedBlock) + 1n;
    if (fromBlock <= latestBlock) {
      log("main", `Catching up from block ${fromBlock} to ${latestBlock}...`);
      await catchUpForceClose(httpClient, fromBlock, latestBlock);
      await catchUpSettlement(httpClient, fromBlock, latestBlock);
    } else {
      log("main", `Already up to date at block ${state.lastProcessedBlock}`);
    }
  } else {
    log("main", `First start — no catch-up needed (starting from block ${latestBlock})`);
  }

  saveState(Number(latestBlock));
  log("main", `State saved at block ${latestBlock}`);
}

function startSubscriptions(): void {
  log("main", "Starting WebSocket subscriptions...");

  unwatchForceClose = watchForceClose(wsClient, httpClient);
  log("main", "Subscribed to AuctionCancelled events");

  unwatchSettlement = watchSettlement(wsClient, httpClient);
  log("main", "Subscribed to SettlementRequested events");
}

async function pollExpiry(): Promise<void> {
  if (shuttingDown) return;
  try {
    await pollExpiredAuctions(httpClient);
  } catch (err) {
    log("main", `Auction expiry poll error (will retry): ${err}`);
  }
}

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log("main", "Shutting down...");

  unwatchForceClose?.();
  unwatchSettlement?.();
  clearInterval(expiryPollTimer);

  log("main", "Goodbye.");
  process.exit(0);
}

async function main(): Promise<void> {
  log("main", "╔══════════════════════════════════════════╗");
  log("main", "║     Private Streams Event Watcher        ║");
  log("main", "╚══════════════════════════════════════════╝");
  log("main", `HTTP RPC: ${HTTP_RPC_URL}`);
  log("main", `WS   RPC: ${WS_RPC_URL}`);
  log("main", `Expiry poll interval: ${EXPIRY_POLL_INTERVAL_MS / 1000}s`);

  // Phase 1: Catch up from last saved block (getLogs over HTTP)
  await catchUp();

  // Phase 2: Start real-time WebSocket subscriptions
  startSubscriptions();

  // Phase 3: Start auction-expiry polling (HTTP)
  await pollExpiry();
  expiryPollTimer = setInterval(pollExpiry, EXPIRY_POLL_INTERVAL_MS);

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await notify("Event Watcher started", `RPC: ${HTTP_RPC_URL}\nPoll interval: ${EXPIRY_POLL_INTERVAL_MS / 1000}s`, ["rocket"]);
  log("main", "Watcher running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  log("main", `Fatal error: ${err}`);
  process.exit(1);
});
