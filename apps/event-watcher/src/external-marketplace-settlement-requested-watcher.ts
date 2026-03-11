/*
NOTE TO CLAUDE: This code relates to the old CRE based system. It's being kept in until you've confirmed the Zama port works end to end. You can use it as reference for how the old system used to work, but you should not update or maintain these files.
*/
/**
 * Settlement-requested watcher — subscribes to SettlementRequested events via
 * WebSocket and triggers the external-prediction-market-settler CRE workflow.
 * Note: The external-prediction-market-scheduler CRE is also invoked directly
 * by cron on the VPS in case this misses something.
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
  publicClient: PublicClient,
  txHash: `0x${string}`,
  logIndex: number,
  eventId: bigint | undefined,
  blockNumber: bigint | null,
): Promise<void> {
  const key = dedupKey(txHash, logIndex);
  if (processed.has(key)) return;

  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  const eventIndex = receipt.logs.findIndex((l) => l.logIndex === logIndex);

  log(
    "settlement-requested",
    `SettlementRequested eventId=${eventId} in block ${blockNumber} — txHash=${txHash.slice(0, 12)}... eventIndex=${eventIndex}`,
  );

  try {
    runCRE({
      workflow: "external-prediction-market-settler",
      triggerIndex: 0,
      evmTxHash: txHash,
      evmEventIndex: eventIndex,
      broadcast: true,
    });
    log("settlement-requested", `CRE completed for event ${eventId}`);
    await notify(
      "SettlementRequested - CRE done",
      `Event ${eventId} settlement requested\nBlock ${blockNumber}\nCRE: external-prediction-market-settler (broadcast)\nCRE topic: https://api.insider-streams.com/external-prediction-market-settler-cre\ntx: ${txHash}`,
      ["white_check_mark"],
      `https://sepolia.etherscan.io/tx/${txHash}`,
    );
  } catch (err) {
    log("settlement-requested", `CRE FAILED for event ${eventId}: ${err}`);
    await notify("SettlementRequested - CRE FAILED", `Event ${eventId}\nCRE: external-prediction-market-settler\n${err}`, ["x"]);
  }

  processed.add(key);
  trimDedup();
}

/** Catch up on missed events since lastProcessedBlock using getLogs. */
export async function catchUpSettlementRequested(
  publicClient: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<void> {
  const logs = await publicClient.getLogs({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS,
    event: examplePredictionMarketAbi.find(
      (e): e is Extract<typeof e, { type: "event"; name: "SettlementRequested" }> =>
        e.type === "event" && e.name === "SettlementRequested",
    )!,
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) return;

  log("settlement-requested", `Catching up: ${logs.length} SettlementRequested event(s) in blocks ${fromBlock}-${toBlock}`);
  for (const entry of logs) {
    await handleEvent(
      publicClient,
      entry.transactionHash,
      entry.logIndex,
      entry.args.eventId,
      entry.blockNumber,
    );
  }
}

/** Subscribe to real-time SettlementRequested events via WebSocket. */
export function watchSettlementRequested(
  wsClient: PublicClient,
  httpClient: PublicClient,
): WatchContractEventReturnType {
  return wsClient.watchContractEvent({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS,
    abi: examplePredictionMarketAbi,
    eventName: "SettlementRequested",
    onLogs: (logs) => {
      for (const entry of logs) {
        handleEvent(
          httpClient,
          entry.transactionHash,
          entry.logIndex,
          entry.args.eventId,
          entry.blockNumber,
        ).catch((err) => {
          log("settlement-requested", `Error handling event: ${err}`);
        });
      }
    },
    onError: (err) => {
      log("settlement-requested", `WebSocket subscription error: ${err.message}`);
    },
  });
}
