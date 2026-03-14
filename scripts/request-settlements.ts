#!/usr/bin/env tsx

/**
 * request-settlements.ts — Single-run script that finds closed-but-unsettled
 * events on ExamplePredictionMarket and calls requestSettlement() for each.
 *
 * Uses the subgraph (1 HTTP call) instead of N+1 getEvent() RPC calls.
 * Designed for cron — runs once and exits.
 *
 * Usage: npx tsx --env-file=.env request-settlements.ts
 */

import { GraphQLClient, gql } from "graphql-request";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  examplePredictionMarketAbi,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
} from "@private-streams/common";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_URL =
  process.env.RPC_URL ??
  "https://eth-sepolia.g.alchemy.com/v2/59LCREaM5uGpTVXZgR8A7z6IiULWjwG6";

const OWNER_PK = process.env.OWNER_PK;
if (!OWNER_PK) {
  console.error("[request-settlements] OWNER_PK env var required");
  process.exit(1);
}

const SUBGRAPH_URL =
  process.env.SUBGRAPH_URL ??
  "https://gateway.thegraph.com/api/subgraphs/id/BttcQ7pVTEz7L94PgnhkFJCY33K5Vwk1vhffckmjgf5f";
const SUBGRAPH_API_KEY = process.env.SUBGRAPH_API_KEY ?? "a075bc6e2e48577d2588bb458b939bdc";

// ---------------------------------------------------------------------------
// ntfy (optional)
// ---------------------------------------------------------------------------

const ENABLE_NTFY = process.env.ENABLE_NTFY === "true";
const NTFY_HOST = process.env.NTFY_HOST ?? "http://localhost:8090";
const NTFY_TOPIC = process.env.NTFY_TOPIC_SETTLEMENTS ?? "zama-script-settlements";
const NTFY_USER = process.env.NTFY_USER ?? "UNKNOWN";

async function ntfy(title: string, message: string, tags?: string[]) {
  if (!ENABLE_NTFY) return;
  try {
    await fetch(`${NTFY_HOST}/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        Title: title,
        ...(tags?.length ? { Tags: tags.join(",") } : {}),
      },
      body: `[${NTFY_USER}] ${message}`,
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error(`  [ntfy] Failed to send notification: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

const CLOSED_UNSETTLED_QUERY = gql`
  query ClosedUnsettledEvents($now: BigInt!) {
    eventCreateds(
      where: { eventClose_lt: $now }
      first: 1000
      orderBy: eventClose
      orderDirection: desc
    ) {
      eventId
      question
      eventClose
    }
    settlementRequesteds(first: 1000) {
      eventId
    }
    settlementResponses(first: 1000) {
      eventId
    }
  }
`;

type ClosedUnsettledResponse = {
  eventCreateds: { eventId: string; question: string; eventClose: string }[];
  settlementRequesteds: { eventId: string }[];
  settlementResponses: { eventId: string }[];
};

async function fetchClosedUnsettledEvents(
  client: GraphQLClient,
): Promise<{ eventId: string; question: string }[]> {
  const now = Math.floor(Date.now() / 1000).toString();
  const data = await client.request<ClosedUnsettledResponse>(
    CLOSED_UNSETTLED_QUERY,
    { now },
  );

  const requestedIds = new Set(
    data.settlementRequesteds.map((r) => r.eventId),
  );
  const settledIds = new Set(
    data.settlementResponses.map((r) => r.eventId),
  );

  return data.eventCreateds.filter(
    (e) => !requestedIds.has(e.eventId) && !settledIds.has(e.eventId),
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const label = new Date().toISOString();
  console.log(`[request-settlements] ${label} — starting`);
  console.log(`[request-settlements] subgraph: ${SUBGRAPH_URL}`);
  console.log(`[request-settlements] RPC: ${RPC_URL}`);

  const gqlClient = new GraphQLClient(SUBGRAPH_URL, {
    headers: { Authorization: `Bearer ${SUBGRAPH_API_KEY}` },
  });

  // 1. Query subgraph for closed-but-unsettled events
  let toSettle: { eventId: string; question: string }[];
  try {
    toSettle = await fetchClosedUnsettledEvents(gqlClient);
  } catch (err) {
    const msg = `Subgraph query failed: ${err}`;
    console.error(`[request-settlements] ${msg}`);
    await ntfy("Settlement Request FAILED", msg, ["x"]);
    process.exit(1);
  }

  if (toSettle.length === 0) {
    console.log("[request-settlements] no closed-but-unsettled events found");
    return;
  }

  console.log(
    `[request-settlements] found ${toSettle.length} event(s) to settle: [${toSettle.map((e) => e.eventId).join(", ")}]`,
  );

  // 2. Set up on-chain clients
  const account = privateKeyToAccount(OWNER_PK as Hex);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  });

  const contract = {
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS as `0x${string}`,
    abi: examplePredictionMarketAbi,
  } as const;

  // 3. Request settlement for each event (sequential to avoid nonce issues)
  const succeeded: string[] = [];
  const failed: { eventId: string; error: string }[] = [];

  for (const event of toSettle) {
    try {
      console.log(
        `[request-settlements] requesting settlement for event ${event.eventId} — "${event.question}"`,
      );
      const hash = await walletClient.writeContract({
        ...contract,
        functionName: "requestSettlement",
        args: [BigInt(event.eventId)],
      });
      console.log(`[request-settlements] event ${event.eventId}: tx ${hash}`);
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`[request-settlements] event ${event.eventId}: confirmed`);
      succeeded.push(event.eventId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("StatusNotOpen")) {
        console.log(
          `[request-settlements] event ${event.eventId}: already settled, skipping`,
        );
      } else {
        console.error(
          `[request-settlements] event ${event.eventId}: FAILED — ${msg}`,
        );
        failed.push({ eventId: event.eventId, error: msg });
      }
    }
  }

  // 4. Summary + ntfy
  const lines: string[] = [];
  if (succeeded.length > 0) {
    lines.push(`Settled: [${succeeded.join(", ")}] (${succeeded.length})`);
  }
  if (failed.length > 0) {
    lines.push(
      `Failed: [${failed.map((f) => f.eventId).join(", ")}] (${failed.length})`,
    );
  }
  const summary = lines.join("\n");
  console.log(`[request-settlements] ${summary}`);

  if (failed.length > 0) {
    await ntfy("Settlement Request Partial", summary, ["warning"]);
  } else {
    await ntfy("Settlements Requested", summary, ["white_check_mark"]);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[request-settlements] fatal:", err);
    ntfy("Settlement Request FATAL", `${err}`, ["x"]).finally(() =>
      process.exit(1),
    );
  });
