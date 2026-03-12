/**
 * One-shot script: admin-close all open E2E test events on ExamplePredictionMarket.
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

// Get total event count
const nextEventId = await publicClient.readContract({
  address: contractAddress,
  abi: examplePredictionMarketAbi,
  functionName: "nextEventId",
});

console.log(`Total events: ${nextEventId}`);
console.log(`Admin: ${account.address}`);
console.log();

for (let eventId = 0; eventId < Number(nextEventId); eventId++) {
  const data = await publicClient.readContract({
    address: contractAddress,
    abi: examplePredictionMarketAbi,
    functionName: "getMarketEvent",
    args: [BigInt(eventId)],
  });

  // Only close events that are Open (status 0)
  if (data.status !== 0) {
    console.log(`Event ${eventId}: status=${data.status}, skipping`);
    continue;
  }

  // Only close test events — skip Venice AI generated ones
  const question = data.question;
  const isTestEvent = question.startsWith("[E2E") || question.startsWith("[e2e") || question.startsWith("[Test");

  if (!isTestEvent) {
    console.log(`Event ${eventId}: "${question.slice(0, 50)}..." — keeping open (not a test event)`);
    continue;
  }

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
    console.error(`Event ${eventId}: FAILED — ${err instanceof Error ? err.message.slice(0, 100) : err}`);
  }
}

console.log("\nDone");
