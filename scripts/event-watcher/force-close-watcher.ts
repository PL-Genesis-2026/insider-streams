/**
 * Force-close watcher — subscribes to AuctionForceClosed events via WebSocket
 * and triggers the force-close-handler CRE workflow to refund active bids.
 *
 * On startup, catches up from lastProcessedBlock using getLogs, then switches
 * to real-time WebSocket subscription.
 */

import type { PublicClient, WatchContractEventReturnType } from "viem";
import {
  SECRET_MARKETPLACE_ADDRESS,
  secretMarketplaceAbi,
} from "@private-streams/common";
import { runCRE } from "./cre-runner.js";
import { log } from "./index.js";

const processed = new Set<string>();
const MAX_PROCESSED = 1000;

function dedupKey(txHash: string, logIndex: number): string {
  return `${txHash}:${logIndex}`;
}

function trimDedup(): void {
  if (processed.size > MAX_PROCESSED) {
    const first = processed.values().next().value;
    if (first) processed.delete(first);
  }
}

async function handleEvent(
  publicClient: PublicClient,
  txHash: `0x${string}`,
  logIndex: number,
  auctionId: bigint | undefined,
  blockNumber: bigint | null,
): Promise<void> {
  const key = dedupKey(txHash, logIndex);
  if (processed.has(key)) return;

  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  const eventIndex = receipt.logs.findIndex((l) => l.logIndex === logIndex);

  log(
    "force-close",
    `AuctionForceClosed auctionId=${auctionId} in block ${blockNumber} — txHash=${txHash.slice(0, 12)}... eventIndex=${eventIndex}`,
  );

  try {
    runCRE({
      workflow: "force-close-handler",
      triggerIndex: 0,
      evmTxHash: txHash,
      evmEventIndex: eventIndex,
    });
    log("force-close", `CRE completed for auction ${auctionId}`);
  } catch (err) {
    log("force-close", `CRE FAILED for auction ${auctionId}: ${err}`);
  }

  processed.add(key);
  trimDedup();
}

/** Catch up on missed events since lastProcessedBlock using getLogs. */
export async function catchUpForceClose(
  publicClient: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<void> {
  const logs = await publicClient.getLogs({
    address: SECRET_MARKETPLACE_ADDRESS,
    event: secretMarketplaceAbi.find(
      (e): e is Extract<typeof e, { type: "event"; name: "AuctionForceClosed" }> =>
        e.type === "event" && e.name === "AuctionForceClosed",
    )!,
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) return;

  log("force-close", `Catching up: ${logs.length} AuctionForceClosed event(s) in blocks ${fromBlock}-${toBlock}`);
  for (const entry of logs) {
    await handleEvent(
      publicClient,
      entry.transactionHash,
      entry.logIndex,
      entry.args.auctionId,
      entry.blockNumber,
    );
  }
}

/** Subscribe to real-time AuctionForceClosed events via WebSocket. */
export function watchForceClose(
  wsClient: PublicClient,
  httpClient: PublicClient,
): WatchContractEventReturnType {
  return wsClient.watchContractEvent({
    address: SECRET_MARKETPLACE_ADDRESS,
    abi: secretMarketplaceAbi,
    eventName: "AuctionForceClosed",
    onLogs: (logs) => {
      for (const entry of logs) {
        handleEvent(
          httpClient,
          entry.transactionHash,
          entry.logIndex,
          entry.args.auctionId,
          entry.blockNumber,
        ).catch((err) => {
          log("force-close", `Error handling event: ${err}`);
        });
      }
    },
    onError: (err) => {
      log("force-close", `WebSocket subscription error: ${err.message}`);
    },
  });
}
