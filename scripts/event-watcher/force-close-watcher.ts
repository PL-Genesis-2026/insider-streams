/**
 * Force-close watcher — polls for AuctionForceClosed events and triggers
 * the force-close-handler CRE workflow to refund active bids in Supabase.
 */

import type { PublicClient } from "viem";
import { parseAbiItem } from "viem";
import { SECRET_MARKETPLACE_ADDRESS } from "@private-streams/common";
import { runCRE } from "./cre-runner.js";
import { log } from "./index.js";

const AUCTION_FORCE_CLOSED = parseAbiItem(
  "event AuctionForceClosed(uint256 indexed auctionId, uint256 heldAmount, string seller, uint256 eventId, int8 reputationDelta)",
);

const processed = new Set<string>();
const MAX_PROCESSED = 1000;

function dedupKey(txHash: string, logIndex: number): string {
  return `${txHash}:${logIndex}`;
}

export async function pollForceCloseEvents(
  publicClient: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<void> {
  const logs = await publicClient.getLogs({
    address: SECRET_MARKETPLACE_ADDRESS,
    event: AUCTION_FORCE_CLOSED,
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) return;

  log("force-close", `Found ${logs.length} AuctionForceClosed event(s) in blocks ${fromBlock}-${toBlock}`);

  for (const entry of logs) {
    const key = dedupKey(entry.transactionHash, entry.logIndex);
    if (processed.has(key)) {
      log("force-close", `Skipping duplicate ${key}`);
      continue;
    }

    // Find event index within the transaction
    const receipt = await publicClient.getTransactionReceipt({
      hash: entry.transactionHash,
    });
    const eventIndex = receipt.logs.findIndex(
      (l) => l.logIndex === entry.logIndex,
    );

    log(
      "force-close",
      `AuctionForceClosed auctionId=${entry.args.auctionId} in block ${entry.blockNumber} — txHash=${entry.transactionHash.slice(0, 12)}... eventIndex=${eventIndex}`,
    );

    try {
      runCRE({
        workflow: "force-close-handler",
        triggerIndex: 0,
        evmTxHash: entry.transactionHash,
        evmEventIndex: eventIndex,
      });
      log("force-close", `CRE force-close-handler completed for auction ${entry.args.auctionId}`);
    } catch (err) {
      log("force-close", `CRE force-close-handler FAILED for auction ${entry.args.auctionId}: ${err}`);
    }

    processed.add(key);
    if (processed.size > MAX_PROCESSED) {
      const first = processed.values().next().value;
      if (first) processed.delete(first);
    }
  }
}
