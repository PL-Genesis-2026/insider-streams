/**
 * Auction-cancelled event watcher — subscribes to AuctionCancelled events via
 * WebSocket and triggers the auction-cancelled-handler CRE workflow to refund
 * active bids.
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
import { notify } from "./notify.js";

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
    "auction-cancelled",
    `AuctionCancelled auctionId=${auctionId} in block ${blockNumber} — txHash=${txHash.slice(0, 12)}... eventIndex=${eventIndex}`,
  );

  try {
    runCRE({
      workflow: "auction-cancelled-handler",
      triggerIndex: 0,
      evmTxHash: txHash,
      evmEventIndex: eventIndex,
    });
    log("auction-cancelled", `CRE completed for auction ${auctionId}`);
    await notify(
      "AuctionCancelled - CRE done",
      `Auction ${auctionId} cancelled\nBlock ${blockNumber}\nCRE: auction-cancelled-handler\nCRE topic: https://api.insider-streams.com/auction-cancelled-handler-cre\ntx: ${txHash}`,
      ["white_check_mark"],
      `https://sepolia.etherscan.io/tx/${txHash}`,
    );
  } catch (err) {
    log("auction-cancelled", `CRE FAILED for auction ${auctionId}: ${err}`);
    await notify("AuctionCancelled - CRE FAILED", `Auction ${auctionId}\nCRE: auction-cancelled-handler\n${err}`, ["x"]);
  }

  processed.add(key);
  trimDedup();
}

/** Catch up on missed events since lastProcessedBlock using getLogs. */
export async function catchUpAuctionCancelled(
  publicClient: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<void> {
  const logs = await publicClient.getLogs({
    address: SECRET_MARKETPLACE_ADDRESS,
    event: secretMarketplaceAbi.find(
      (e): e is Extract<typeof e, { type: "event"; name: "AuctionCancelled" }> =>
        e.type === "event" && e.name === "AuctionCancelled",
    )!,
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) return;

  log("auction-cancelled", `Catching up: ${logs.length} AuctionCancelled event(s) in blocks ${fromBlock}-${toBlock}`);
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

/** Subscribe to real-time AuctionCancelled events via WebSocket. */
export function watchAuctionCancelled(
  wsClient: PublicClient,
  httpClient: PublicClient,
): WatchContractEventReturnType {
  return wsClient.watchContractEvent({
    address: SECRET_MARKETPLACE_ADDRESS,
    abi: secretMarketplaceAbi,
    eventName: "AuctionCancelled",
    onLogs: (logs) => {
      for (const entry of logs) {
        handleEvent(
          httpClient,
          entry.transactionHash,
          entry.logIndex,
          entry.args.auctionId,
          entry.blockNumber,
        ).catch((err) => {
          log("auction-cancelled", `Error handling event: ${err}`);
        });
      }
    },
    onError: (err) => {
      log("auction-cancelled", `WebSocket subscription error: ${err.message}`);
    },
  });
}
