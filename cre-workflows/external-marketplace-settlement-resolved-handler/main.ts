import { cre, type Runtime, Runner, getNetwork, bytesToHex, type EVMLog } from "@chainlink/cre-sdk";
import { keccak256, toHex, decodeEventLog, parseAbi } from "viem";
import { configSchema, type Config, OUTCOME_YES, OUTCOME_NO, OUTCOME_INCONCLUSIVE } from "./types";
import { fetchAuctionIdsForEvent } from "./monitor";
import { fetchSecretsForAuctions, type SecretWithPrediction } from "./supabase";
import { submitResolveReport, type AuctionResultTuple } from "./resolve";
import { sendNotification } from "./notify";

const FRONTEND_URL = "https://insider-streams-insider-streams-fro.vercel.app";
const ETHERSCAN_URL = "https://sepolia.etherscan.io/tx";

/** ABI for the SettlementResponse event this workflow listens for. */
const eventAbi = parseAbi([
  "event SettlementResponse(uint256 indexed eventId, uint8 indexed status, uint8 indexed outcome)",
]);
const eventSignature = "SettlementResponse(uint256,uint8,uint8)";

/**
 * Log-triggered handler — fires on each SettlementResponse event.
 * Decodes the event to get eventId and outcome, fetches auction IDs from the
 * subgraph, fetches seller predictions from Supabase, compares to actual
 * outcome, and submits per-auction reputation updates on-chain.
 *
 * Resource budget per invocation:
 *   0 chain reads (subgraph replaces getUnresolvedEvents + getEvent + getEventAuctions)
 *   1 HTTP call (subgraph: auction IDs for this event)
 *   1 HTTP call (Supabase: secrets/predictions for those auctions)
 *   1 chain write (submitResolveReport)
 *   1 HTTP call (ntfy notification)
 */
const onLogTrigger = (runtime: Runtime<Config>, log: EVMLog): string => {
  try {
    // Decode the SettlementResponse event
    const topics = log.topics.map((t) => bytesToHex(t)) as [
      `0x${string}`,
      ...`0x${string}`[],
    ];
    const data = bytesToHex(log.data);
    const decoded = decodeEventLog({ abi: eventAbi, data, topics });

    const eventId = decoded.args.eventId as bigint;
    const outcome = Number(decoded.args.outcome);

    runtime.log(`SettlementResponse: event=${eventId}, outcome=${outcome}`);

    // Validate outcome — must be Yes (2), No (1), or Inconclusive (3)
    if (outcome !== OUTCOME_YES && outcome !== OUTCOME_NO && outcome !== OUTCOME_INCONCLUSIVE) {
      const msg = `Unexpected outcome ${outcome} for event ${eventId}, skipping`;
      runtime.log(msg);
      return msg;
    }

    // Phase 1: Get auction IDs for this event from subgraph (1 HTTP call, 0 chain reads)
    const auctionIds = fetchAuctionIdsForEvent(runtime, eventId);

    if (auctionIds.length === 0) {
      const msg = `Event ${eventId}: no auctions found, nothing to resolve`;
      runtime.log(msg);
      sendNotification(runtime, `Reputation Skip: Event ${eventId}`, msg);
      return msg;
    }

    // Phase 2: Fetch secrets/predictions from Supabase (1 HTTP call)
    const secrets = fetchSecretsForAuctions(
      runtime,
      auctionIds.map((id) => id.toString()),
    );
    const secretsMap = new Map<string, SecretWithPrediction>(
      secrets.map((s) => [s.auction_id, s]),
    );

    // Phase 3: Compare predictions to actual outcome
    const results: AuctionResultTuple[] = [];
    const auctionDetails: string[] = [];

    for (const auctionId of auctionIds) {
      const secret = secretsMap.get(auctionId.toString());

      if (!secret || !secret.event_data) {
        runtime.log(`Auction ${auctionId}: no event_data, skipping`);
        continue;
      }

      const sellerPrediction = secret.event_data.outcome;
      let predictionOutcome: number;
      if (outcome === OUTCOME_INCONCLUSIVE) {
        predictionOutcome = 2; // PredictionWrong
      } else if (
        (sellerPrediction === "yes" && outcome === OUTCOME_YES) ||
        (sellerPrediction === "no" && outcome === OUTCOME_NO)
      ) {
        predictionOutcome = 1; // PredictionCorrect
      } else {
        predictionOutcome = 2; // PredictionWrong
      }

      const actualLabel = outcome === OUTCOME_INCONCLUSIVE ? "inconclusive" : outcome === OUTCOME_YES ? "yes" : "no";
      const outcomeLabel = predictionOutcome === 1 ? "correct" : "wrong";
      runtime.log(
        `Auction ${auctionId}: predicted=${sellerPrediction}, actual=${actualLabel}, outcome=${outcomeLabel}`,
      );
      auctionDetails.push(`  Auction ${auctionId}: predicted=${sellerPrediction}, actual=${actualLabel} → ${outcomeLabel}\n    ${FRONTEND_URL}/auction/${auctionId}`);

      results.push({ auctionId, predictionOutcome });
    }

    // Phase 4: Submit reputation report on-chain (1 chain write)
    const txHash = submitResolveReport(runtime, eventId, results);

    const resultMessages = [
      `Event ${eventId}: resolved (${results.length} result(s))`,
      ...auctionDetails,
    ];
    const summary = resultMessages.join("\n");
    runtime.log(summary);

    const etherscanUrl = txHash ? `${ETHERSCAN_URL}/${txHash}` : undefined;
    sendNotification(runtime, `Reputation Resolved: Event ${eventId}`, summary, etherscanUrl);
    return summary;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`onLogTrigger error: ${msg}`);
    sendNotification(runtime, "Reputation Resolution FAILED", msg);
    throw err;
  }
};

/**
 * Workflow init — registers log trigger for SettlementResponse events
 * on the ExamplePredictionMarket contract.
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

  const evmClient = new cre.capabilities.EVMClient(
    network.chainSelector.selector,
  );

  const responseHash = keccak256(toHex(eventSignature));

  return [
    cre.handler(
      evmClient.logTrigger({
        addresses: [config.evms[0].examplePredictionMarketAddress],
        topics: [{ values: [responseHash] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onLogTrigger,
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
