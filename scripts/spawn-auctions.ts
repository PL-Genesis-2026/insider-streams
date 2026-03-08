#!/usr/bin/env tsx

import { GraphQLClient, gql } from "graphql-request";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, type Hex } from "viem";
import { sepolia } from "viem/chains";
import {
  CREATE_AUCTION_EIP712_DOMAIN,
  CREATE_AUCTION_EIP712_TYPES,
} from "@private-streams/common";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUBGRAPH_URL =
  "https://api.studio.thegraph.com/query/1743303/insider-streams-2/version/latest";

const BASE_URL =
  process.env.FRONTEND_BASE_URL ??
  process.env.BASE_URL ??
  "http://localhost:3000";

const INTERVAL_MS = process.env.INTERVAL_MS
  ? parseInt(process.env.INTERVAL_MS, 10)
  : 5 * 60 * 1000;

const DURATION = "6h" as const;

const SECRET_POOL = [
  "YES",
  "NO",
  "The answer is YES.",
  "The answer is NO.",
  "Prediction: YES",
  "Prediction: NO",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizePrivateKey(value: string): Hex {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error(`Invalid private key: ${value.slice(0, 10)}...`);
  }
  return normalized as Hex;
}

function getTestAccounts(): Hex[] {
  const keys: Hex[] = [];
  for (let i = 1; i <= 25; i++) {
    const raw = process.env[`TEST_ACCOUNT_${i}`];
    if (raw) {
      try {
        keys.push(normalizePrivateKey(raw));
      } catch {
        console.warn(`[spawn-auctions] TEST_ACCOUNT_${i} is invalid, skipping`);
      }
    }
  }
  return keys;
}

function timestamp(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

const OPEN_EVENTS_QUERY = gql`
  {
    eventCreateds(first: 100, orderBy: blockTimestamp, orderDirection: desc) {
      eventId
      question
    }
    settlementResponses(first: 1000) {
      eventId
    }
  }
`;

type SubgraphResponse = {
  eventCreateds: { eventId: string; question: string }[];
  settlementResponses: { eventId: string }[];
};

async function fetchOpenEvents(
  client: GraphQLClient,
): Promise<{ eventId: string; question: string }[]> {
  const data = await client.request<SubgraphResponse>(OPEN_EVENTS_QUERY);
  const settledIds = new Set(data.settlementResponses.map((r) => r.eventId));
  return data.eventCreateds.filter((e) => !settledIds.has(e.eventId));
}

// ---------------------------------------------------------------------------
// Auction creation
// ---------------------------------------------------------------------------

async function createAuction(
  pk: Hex,
  eventId: string,
  secretPayload: string,
): Promise<{ auctionId?: string; ok: boolean; status: number; body: unknown }> {
  const account = privateKeyToAccount(pk);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(),
  });

  const ts = timestamp();
  const signature = await walletClient.signTypedData({
    account,
    domain: CREATE_AUCTION_EIP712_DOMAIN,
    types: CREATE_AUCTION_EIP712_TYPES,
    primaryType: "CreateAuction",
    message: {
      eventId,
      privateLeg: "yes",
      duration: DURATION,
      timestamp: BigInt(ts),
    },
  });

  const payload = {
    eventId,
    privateLeg: "yes",
    secretPayload,
    duration: DURATION,
    timestamp: ts,
    signature,
  };

  const response = await fetch(`${BASE_URL}/api/create-auction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text
  }

  const auctionId =
    body != null &&
    typeof body === "object" &&
    "auctionId" in body &&
    typeof (body as Record<string, unknown>).auctionId === "string"
      ? ((body as Record<string, unknown>).auctionId as string)
      : undefined;

  return { auctionId, ok: response.ok, status: response.status, body };
}

// ---------------------------------------------------------------------------
// Main cycle
// ---------------------------------------------------------------------------

// Codes returned by the API when the event itself is the problem (not a bug).
// On these, we skip the event and try the next one rather than giving up.
const SKIPPABLE_CODES = new Set([
  "EVENT_NOT_FOUND",
  "EVENT_NOT_OPEN",
  "EVENT_EXPIRED",
]);

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

async function runCycle(client: GraphQLClient, accounts: Hex[]): Promise<void> {
  const label = new Date().toISOString();
  console.log(`[spawn-auctions] ${label} — starting cycle`);

  let openEvents: { eventId: string; question: string }[];
  try {
    openEvents = await fetchOpenEvents(client);
  } catch (err) {
    console.error("[spawn-auctions] subgraph query failed:", err);
    return;
  }

  if (openEvents.length === 0) {
    console.log("[spawn-auctions] no open events, skipping");
    return;
  }

  // Shuffle so each cycle tries events in a different order.
  const candidates = shuffle(openEvents);
  const pk = pickRandom(accounts);
  const account = privateKeyToAccount(pk);

  for (const event of candidates) {
    const secretPayload = pickRandom(SECRET_POOL);

    console.log(
      `[spawn-auctions] trying event ${event.eventId} — "${event.question}"`,
    );
    console.log(`[spawn-auctions] signer: ${account.address}`);
    console.log(`[spawn-auctions] secret: "${secretPayload}"`);

    try {
      const result = await createAuction(pk, event.eventId, secretPayload);

      if (result.ok) {
        console.log(
          `[spawn-auctions] auction created — id: ${result.auctionId ?? "(unknown)"}`,
        );
        return;
      }

      const code =
        result.body != null &&
        typeof result.body === "object" &&
        "code" in result.body
          ? String((result.body as Record<string, unknown>).code)
          : undefined;

      if (result.status === 400 && code && SKIPPABLE_CODES.has(code)) {
        console.log(
          `[spawn-auctions] event ${event.eventId} not eligible (${code}), trying next`,
        );
        continue;
      }

      console.error(
        `[spawn-auctions] create-auction failed (HTTP ${result.status}):`,
        result.body,
      );
      return;
    } catch (err) {
      console.error("[spawn-auctions] create-auction threw:", err);
      return;
    }
  }

  console.log("[spawn-auctions] all candidate events were skipped, nothing created this cycle");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const accounts = getTestAccounts();
if (accounts.length === 0) {
  console.error(
    "[spawn-auctions] no test accounts found — set TESTER_PK_1 through TESTER_PK_10 in scripts/.env",
  );
  process.exit(1);
}

console.log(`[spawn-auctions] loaded ${accounts.length} test account(s)`);
console.log(`[spawn-auctions] base URL: ${BASE_URL}`);
console.log(`[spawn-auctions] interval: ${INTERVAL_MS / 1000}s`);
console.log(`[spawn-auctions] subgraph: ${SUBGRAPH_URL}`);

const client = new GraphQLClient(SUBGRAPH_URL);

// Run immediately, then on interval
runCycle(client, accounts);
const timer = setInterval(() => runCycle(client, accounts), INTERVAL_MS);

function shutdown(): void {
  console.log("\n[spawn-auctions] shutting down");
  clearInterval(timer);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
