/**
 * Settlement-response watcher — subscribes to SettlementResponse events via
 * WebSocket and triggers the external-marketplace-settlement-resolved-handler
 * CRE workflow to resolve per-auction reputation immediately instead of
 * waiting for its 60s cron.
 *
 * The CRE workflow is cron-triggered, so we invoke it without a tx hash
 * (same pattern as auction-closed triggering auction-closer).
 *
 * On startup, catches up from lastProcessedBlock using getLogs, then switches
 * to real-time WebSocket subscription.
 */

import type { PublicClient, WatchContractEventReturnType } from "viem";
import {
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  examplePredictionMarketAbi,
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
  txHash: `0x${string}`,
  logIndex: number,
  eventId: bigint | undefined,
  blockNumber: bigint | null,
): Promise<void> {
  const key = dedupKey(txHash, logIndex);
  if (processed.has(key)) return;

  log(
    "settlement-response",
    `SettlementResponse eventId=${eventId} in block ${blockNumber} — txHash=${txHash.slice(0, 12)}...`,
  );

  try {
    runCRE({
      workflow: "external-marketplace-settlement-resolved-handler",
      triggerIndex: 0,
      broadcast: true,
    });
    log("settlement-response", `CRE completed for event ${eventId}`);
    await notify("SettlementResponse - CRE done", `Event ${eventId} reputation resolution broadcast\nBlock ${blockNumber}\ntx ${txHash.slice(0, 16)}...`, ["white_check_mark"]);
  } catch (err) {
    log("settlement-response", `CRE FAILED for event ${eventId}: ${err}`);
    await notify("SettlementResponse - CRE FAILED", `Event ${eventId}\n${err}`, ["x"]);
  }

  processed.add(key);
  trimDedup();
}

/** Catch up on missed events since lastProcessedBlock using getLogs. */
export async function catchUpSettlementResponse(
  publicClient: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<void> {
  const logs = await publicClient.getLogs({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS,
    event: examplePredictionMarketAbi.find(
      (e): e is Extract<typeof e, { type: "event"; name: "SettlementResponse" }> =>
        e.type === "event" && e.name === "SettlementResponse",
    )!,
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) return;

  log("settlement-response", `Catching up: ${logs.length} SettlementResponse event(s) in blocks ${fromBlock}-${toBlock}`);
  for (const entry of logs) {
    await handleEvent(
      entry.transactionHash,
      entry.logIndex,
      entry.args.eventId,
      entry.blockNumber,
    );
  }
}

/** Subscribe to real-time SettlementResponse events via WebSocket. */
export function watchSettlementResponse(
  wsClient: PublicClient,
  httpClient: PublicClient,
): WatchContractEventReturnType {
  return wsClient.watchContractEvent({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS,
    abi: examplePredictionMarketAbi,
    eventName: "SettlementResponse",
    onLogs: (logs) => {
      for (const entry of logs) {
        handleEvent(
          entry.transactionHash,
          entry.logIndex,
          entry.args.eventId,
          entry.blockNumber,
        ).catch((err) => {
          log("settlement-response", `Error handling event: ${err}`);
        });
      }
    },
    onError: (err) => {
      log("settlement-response", `WebSocket subscription error: ${err.message}`);
    },
  });
}
