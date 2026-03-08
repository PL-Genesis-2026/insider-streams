import { cre, type Runtime, Runner, getNetwork, type CronPayload } from "@chainlink/cre-sdk";
import { configSchema, CRON_SCHEDULE, type Config, OUTCOME_YES, OUTCOME_NO, OUTCOME_INCONCLUSIVE } from "./types";
import { findSettledUnresolvedEvents } from "./monitor";
import { fetchSecretsForAuctions, type SecretWithPrediction } from "./supabase";
import { submitResolveReport, type AuctionResultTuple } from "./resolve";
import { sendNotification } from "./notify";

/**
 * Handler — checks for settled but unresolved events, fetches secrets from
 * Supabase, compares predictions to actual outcomes, and submits per-auction
 * reputation updates on-chain.
 */
const onTrigger = (runtime: Runtime<Config>): string => {
  try {
    runtime.log("Reputation resolver triggered — checking for settled unresolved events");

    // Phase 1: Find settled unresolved events (EVM reads — free)
    const settledEvents = findSettledUnresolvedEvents(runtime);

    if (settledEvents.length === 0) {
      runtime.log("No settled unresolved events found");
      return "No settled unresolved events";
    }

    runtime.log(`Found ${settledEvents.length} settled unresolved event(s)`);

    // Phase 2: Batch-fetch secrets for all auction IDs (1 HTTP call)
    const allAuctionIds = settledEvents.flatMap((e) =>
      e.auctionIds.map((id) => id.toString()),
    );
    const secrets = fetchSecretsForAuctions(runtime, allAuctionIds);
    const secretsMap = new Map<string, SecretWithPrediction>(
      secrets.map((s) => [s.auction_id, s]),
    );

    // Phase 3: Build results and submit per-event reports
    const resultMessages: string[] = [];
    let lastTxHash = "";

    for (const event of settledEvents) {
      const results: AuctionResultTuple[] = [];
      const auctionDetails: string[] = [];

      for (const auctionId of event.auctionIds) {
        const secret = secretsMap.get(auctionId.toString());

        if (!secret || !secret.event_data) {
          // No prediction — skip (will get 0 delta in contract Phase 3)
          runtime.log(`Auction ${auctionId}: no event_data, skipping`);
          continue;
        }

        const sellerPrediction = secret.event_data.outcome;
        let predictionOutcome: number;
        if (event.outcome === OUTCOME_INCONCLUSIVE) {
          // Inconclusive markets penalize all predictions
          predictionOutcome = 2; // PredictionWrong
        } else if (
          (sellerPrediction === "yes" && event.outcome === OUTCOME_YES) ||
          (sellerPrediction === "no" && event.outcome === OUTCOME_NO)
        ) {
          predictionOutcome = 1; // PredictionCorrect
        } else {
          predictionOutcome = 2; // PredictionWrong
        }

        const actualLabel = event.outcome === OUTCOME_INCONCLUSIVE ? "inconclusive" : event.outcome === OUTCOME_YES ? "yes" : "no";
        const outcomeLabel = predictionOutcome === 1 ? "correct" : "wrong";
        runtime.log(
          `Auction ${auctionId}: predicted=${sellerPrediction}, actual=${actualLabel}, outcome=${outcomeLabel}`,
        );
        auctionDetails.push(`  Auction ${auctionId}: predicted=${sellerPrediction}, actual=${actualLabel} → ${outcomeLabel}`);

        results.push({ auctionId, predictionOutcome });
      }

      try {
        const txHash = submitResolveReport(runtime, event.eventId, results);
        lastTxHash = txHash;
        resultMessages.push(
          `Event ${event.eventId}: resolved (${results.length} results)`,
        );
        if (auctionDetails.length > 0) resultMessages.push(...auctionDetails);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.log(`Failed to resolve event ${event.eventId}: ${msg}`);
        resultMessages.push(`Event ${event.eventId}: FAILED (${msg})`);
      }
    }

    const summary = resultMessages.join("\n");
    runtime.log(summary);
    const etherscanUrl = lastTxHash ? `https://sepolia.etherscan.io/tx/${lastTxHash}` : undefined;
    sendNotification(runtime, `Reputation Resolved: ${settledEvents.length} event(s)`, summary, etherscanUrl);
    return summary;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`onTrigger error: ${msg}`);
    sendNotification(runtime, "Reputation Resolution FAILED", msg);
    throw err;
  }
};

/**
 * Workflow init — registers both cron and REST triggers.
 * Cron fires every 60 seconds, REST allows manual invocation for E2E tests.
 */
const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.evms[0].chainSelectorName,
    isTestnet: true,
  });
  if (!network) {
    throw new Error(`Network not found for: ${config.evms[0].chainSelectorName}`);
  }

  const cronCap = new cre.capabilities.CronCapability();

  return [
    cre.handler(cronCap.trigger({ schedule: CRON_SCHEDULE }), onTrigger),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
