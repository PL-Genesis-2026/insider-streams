/**
 * One-shot script: admin-close + request-settlement for E2E test events.
 *
 * Pipeline per event:
 *   1. If status=Open and eventClose is in the future → adminCloseEvent (sets eventClose=now)
 *   2. If status=Open (eventClose now in the past)    → requestSettlement
 *
 * After this script runs, the daemon's settler will pick up SettlementRequested
 * events, settle them via Gemini AI, and the reputation-resolver will then
 * call resolveEventPredictions which auto-cancels any still-open auctions.
 *
 * Usage: cd scripts && tsx --env-file=../apps/daemon/.env admin-close-test-events.ts
 */

import { createPublicClient, createWalletClient, http } from "viem";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  examplePredictionMarketAbi,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
} from "@private-streams/common";

const pk = process.env.PRIVATE_KEY;
if (!pk) throw new Error("PRIVATE_KEY not set in env");

const account = privateKeyToAccount(pk as Hex);
const rpcUrl = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
const contractAddress = EXAMPLE_PREDICTION_MARKET_ADDRESS as `0x${string}`;

const nextEventId = await publicClient.readContract({
  address: contractAddress,
  abi: examplePredictionMarketAbi,
  functionName: "nextEventId",
});

console.log(`Total events: ${nextEventId}`);
console.log(`Admin: ${account.address}`);
console.log();

const statusLabels = ["Open", "SettlementRequested", "AdminClosed", "Settled", "NeedsManual"];

for (let eventId = 0; eventId < Number(nextEventId); eventId++) {
  const data = await publicClient.readContract({
    address: contractAddress,
    abi: examplePredictionMarketAbi,
    functionName: "getMarketEvent",
    args: [BigInt(eventId)],
  });

  const question = data.question;
  const isTestEvent =
    question.startsWith("[E2E") ||
    question.startsWith("[e2e") ||
    question.startsWith("[Test") ||
    question === ""; // empty question = test artifact

  // Skip non-test events
  if (!isTestEvent) {
    console.log(`Event ${eventId}: "${question.slice(0, 50)}..." — skipping (not a test event)`);
    continue;
  }

  // Skip already-settled or beyond
  if (data.status >= 2) {
    console.log(`Event ${eventId}: ${statusLabels[data.status]}, skipping`);
    continue;
  }

  const now = BigInt(Math.floor(Date.now() / 1000));

  // Step 1: Admin-close if event hasn't closed yet
  if (data.status === 0 && data.eventClose > now) {
    try {
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: examplePredictionMarketAbi,
        functionName: "adminCloseEvent",
        args: [BigInt(eventId)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`Event ${eventId}: admin-closed (tx: ${hash.slice(0, 14)}...)`);
    } catch (err) {
      console.error(`Event ${eventId}: adminCloseEvent FAILED — ${err instanceof Error ? err.message.slice(0, 100) : err}`);
      continue;
    }
  }

  // Step 2: Request settlement if status is still Open
  if (data.status === 0) {
    try {
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: examplePredictionMarketAbi,
        functionName: "requestSettlement",
        args: [BigInt(eventId)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`Event ${eventId}: settlement requested (tx: ${hash.slice(0, 14)}...)`);
    } catch (err) {
      console.error(`Event ${eventId}: requestSettlement FAILED — ${err instanceof Error ? err.message.slice(0, 100) : err}`);
    }
  } else if (data.status === 1) {
    console.log(`Event ${eventId}: already SettlementRequested, waiting for settler`);
  }
}

console.log("\nDone — settler daemon will now process SettlementRequested events");
