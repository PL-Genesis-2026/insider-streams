/**
 * Settlement watcher — polls for SettlementRequested events and triggers
 * the external-prediction-market-settler CRE workflow (Gemini AI settlement).
 */

import type { PublicClient } from "viem";
import { parseAbiItem } from "viem";
import { EXAMPLE_PREDICTION_MARKET_ADDRESS } from "@private-streams/common";
import { runCRE } from "./cre-runner.js";
import { log } from "./index.js";

const SETTLEMENT_REQUESTED = parseAbiItem(
  "event SettlementRequested(uint256 indexed eventId, string question)",
);

const processed = new Set<string>();
const MAX_PROCESSED = 1000;

function dedupKey(txHash: string, logIndex: number): string {
  return `${txHash}:${logIndex}`;
}

export async function pollSettlementEvents(
  publicClient: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<void> {
  const logs = await publicClient.getLogs({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS,
    event: SETTLEMENT_REQUESTED,
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) return;

  log("settlement", `Found ${logs.length} SettlementRequested event(s) in blocks ${fromBlock}-${toBlock}`);

  for (const entry of logs) {
    const key = dedupKey(entry.transactionHash, entry.logIndex);
    if (processed.has(key)) {
      log("settlement", `Skipping duplicate ${key}`);
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
      "settlement",
      `SettlementRequested eventId=${entry.args.eventId} in block ${entry.blockNumber} — txHash=${entry.transactionHash.slice(0, 12)}... eventIndex=${eventIndex}`,
    );

    try {
      runCRE({
        workflow: "external-prediction-market-settler",
        triggerIndex: 0,
        evmTxHash: entry.transactionHash,
        evmEventIndex: eventIndex,
        broadcast: true,
      });
      log("settlement", `CRE external-prediction-market-settler completed for event ${entry.args.eventId}`);
    } catch (err) {
      log("settlement", `CRE external-prediction-market-settler FAILED for event ${entry.args.eventId}: ${err}`);
    }

    processed.add(key);
    if (processed.size > MAX_PROCESSED) {
      const first = processed.values().next().value;
      if (first) processed.delete(first);
    }
  }
}
