#!/usr/bin/env tsx
/**
 * spawn-auctions.ts — Create auctions on open prediction market events.
 *
 * Uses the daemon HTTP API directly (POST /create-auction) with personal_sign
 * authentication, matching verifySignedRequest in @private-streams/common.
 *
 * Runs once per invocation; scheduling is handled by cron.
 *
 * Flow:
 *   1. Load test accounts from env (TEST_ACCOUNT_1..25)
 *   2. Query subgraph for open events (exclude settled)
 *   3. Pick a random account and event
 *   4. Sign and POST to daemon /create-auction
 *
 * Env vars (scripts/.env):
 *   TEST_ACCOUNT_1..25      — private keys for auction creators
 *   DAEMON_URL / BASE_URL   — daemon origin (default: http://localhost:3001)
 *   SUBGRAPH_URL            — subgraph endpoint (default: insider-streams-zama)
 */

import stringify from "fast-json-stable-stringify";
import { GraphQLClient, gql } from "graphql-request";
import { privateKeyToAccount } from "viem/accounts";
import { type Hex } from "viem";
import {
  CREATE_AUCTION_DURATION_SECONDS,
  type CreateAuctionDuration,
} from "@private-streams/common";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUBGRAPH_URL = process.env.SUBGRAPH_URL ??
  "https://gateway.thegraph.com/api/subgraphs/id/BttcQ7pVTEz7L94PgnhkFJCY33K5Vwk1vhffckmjgf5f";
const SUBGRAPH_API_KEY = process.env.SUBGRAPH_API_KEY ?? "a075bc6e2e48577d2588bb458b939bdc";

const DAEMON_URL =
  process.env.DAEMON_URL ?? process.env.BASE_URL ?? "http://localhost:3001";

const DURATIONS: CreateAuctionDuration[] = ["5m", "15m", "30m", "1h"];

const SECRET_POOL = [
  "YES",
  "NO",
  "The answer is YES.",
  "The answer is NO.",
  "Prediction: YES",
  "Prediction: NO",
];

// ---------------------------------------------------------------------------
// ntfy (optional)
// ---------------------------------------------------------------------------

const ENABLE_NTFY = process.env.ENABLE_NTFY === "true";
const NTFY_HOST = process.env.NTFY_HOST ?? "http://localhost:8090";
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "auction-creator-script";
const NTFY_USER = process.env.NTFY_USER ?? "UNKNOWN";

async function ntfy(title: string, message: string, tags?: string[], clickUrl?: string) {
  if (!ENABLE_NTFY) return;
  try {
    await fetch(`${NTFY_HOST}/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        Title: title,
        ...(tags?.length ? { Tags: tags.join(",") } : {}),
        ...(clickUrl ? { Click: clickUrl } : {}),
      },
      body: `[${NTFY_USER}] ${message}`,
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error(`  [ntfy] Failed to send notification: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function normalizePrivateKey(value: string): Hex {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error(`Invalid private key: ${value.slice(0, 10)}...`);
  }
  return normalized as Hex;
}

interface TestAccount {
  privateKey: Hex;
  address: `0x${string}`;
  account: ReturnType<typeof privateKeyToAccount>;
}

function getTestAccounts(): TestAccount[] {
  const keys: TestAccount[] = [];
  for (let i = 1; i <= 25; i++) {
    const raw = process.env[`TEST_ACCOUNT_${i}`];
    if (raw) {
      try {
        const pk = normalizePrivateKey(raw);
        const account = privateKeyToAccount(pk);
        keys.push({ privateKey: pk, address: account.address, account });
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
// Daemon API helper (personal_sign, matches verifySignedRequest)
// ---------------------------------------------------------------------------

async function signedPost(
  account: TestAccount,
  endpoint: string,
  fields: Record<string, unknown> = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const ts = timestamp();
  const payload = { ...fields, timestamp: ts };
  const message = stringify(payload);
  const signature = await account.account.signMessage({ message });

  const response = await fetch(`${DAEMON_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, signature }),
    signal: AbortSignal.timeout(120_000),
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text
  }

  return { ok: response.ok, status: response.status, body };
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
// Main cycle
// ---------------------------------------------------------------------------

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

async function runCycle(client: GraphQLClient, accounts: TestAccount[]): Promise<void> {
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

  const candidates = shuffle(openEvents);
  const ta = pickRandom(accounts);

  for (const event of candidates) {
    const secretPayload = pickRandom(SECRET_POOL);
    const duration = pickRandom(DURATIONS);
    const durationSeconds = CREATE_AUCTION_DURATION_SECONDS[duration];
    const endTime = timestamp() + durationSeconds;
    const prediction = secretPayload.includes("YES") ? "true" : "false";

    console.log(
      `[spawn-auctions] trying event ${event.eventId} — "${event.question}"`,
    );
    console.log(`[spawn-auctions] signer: ${ta.address}`);
    console.log(`[spawn-auctions] secret: "${secretPayload}", duration: ${duration}`);

    try {
      const result = await signedPost(ta, "/create-auction", {
        eventId: event.eventId,
        eventTitle: event.question,
        endTime: String(endTime),
        prediction,
        secretPayload,
      });

      if (result.ok) {
        const auctionId =
          result.body != null &&
          typeof result.body === "object" &&
          "auctionId" in result.body
            ? String((result.body as Record<string, unknown>).auctionId)
            : "?";
        const msg = `Auction ${auctionId} (${duration}) for event ${event.eventId}\n"${event.question}"`;
        console.log(`[spawn-auctions] ${msg}`);
        await ntfy("Auction Created", msg, ["tada"]);
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

      const errMsg = `create-auction failed (HTTP ${result.status}): ${JSON.stringify(result.body)}`;
      console.error(`[spawn-auctions] ${errMsg}`);
      await ntfy("Auction Spawn FAILED", errMsg, ["x"]);
      return;
    } catch (err) {
      const errMsg = `create-auction threw: ${err}`;
      console.error(`[spawn-auctions] ${errMsg}`);
      await ntfy("Auction Spawn FAILED", errMsg, ["x"]);
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
    "[spawn-auctions] no test accounts found — set TEST_ACCOUNT_1 through TEST_ACCOUNT_25 in scripts/.env",
  );
  process.exit(1);
}

console.log(`[spawn-auctions] loaded ${accounts.length} test account(s)`);
console.log(`[spawn-auctions] daemon: ${DAEMON_URL}`);
console.log(`[spawn-auctions] subgraph: ${SUBGRAPH_URL}`);

const client = new GraphQLClient(SUBGRAPH_URL, {
  headers: { Authorization: `Bearer ${SUBGRAPH_API_KEY}` },
});

runCycle(client, accounts)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[spawn-auctions] fatal:", err);
    process.exit(1);
  });
