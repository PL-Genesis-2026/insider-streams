#!/usr/bin/env tsx
/**
 * spawn-auctions.ts — Create auctions on open prediction market events.
 *
 * Performs FHE encryption and on-chain contract calls directly via OWNER_PK
 * (admin EOA), bypassing the daemon HTTP API. This lets the scripts VPS run
 * its own Zama relayer rate limit bucket independently from the API VPS.
 *
 * Daemon SQLite is kept in sync via lightweight internal API calls
 * (/internal/register-user, /internal/insert-secret) which don't touch
 * the Zama relayer.
 *
 * Runs once per invocation; scheduling is handled by cron.
 *
 * Flow:
 *   1. Load test accounts from env (TEST_ACCOUNT_1..25)
 *   2. Query subgraph for open events (exclude settled)
 *   3. Pick a random account and event
 *   4. If VENICE_API_KEY is set, research the event via AI
 *   5. FHE-encrypt prediction + secret key, call createAuction on-chain
 *   6. Sync auction secret to daemon SQLite via internal API
 *
 * Env vars (scripts/.env):
 *   OWNER_PK                — admin EOA private key (submits all on-chain txs)
 *   RPC_URL                 — Ethereum RPC URL (default: publicnode Sepolia)
 *   INTERNAL_API_KEY        — shared secret for daemon internal API
 *   DAEMON_URL / BASE_URL   — daemon origin for internal API (default: http://localhost:3001)
 *   TEST_ACCOUNT_1..25      — private keys for auction creators (identity only)
 *   SUBGRAPH_URL            — subgraph endpoint (default: insider-streams-zama)
 *   VENICE_API_KEY          — (optional) Venice AI key for researched secrets
 */

import { createHash, randomBytes } from "node:crypto";
import { GraphQLClient, gql } from "graphql-request";
import OpenAI from "openai";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, decodeEventLog, http, toHex, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { z } from "zod";
import {
  CREATE_AUCTION_DURATION_SECONDS,
  type CreateAuctionDuration,
  SECRET_MARKETPLACE_ADDRESS,
  fheSecretMarketplaceAbi,
} from "@private-streams/common";
import { encryptAuctionInputs } from "@private-streams/common/fhe";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUBGRAPH_URL = process.env.SUBGRAPH_URL ??
  "https://gateway.thegraph.com/api/subgraphs/id/BttcQ7pVTEz7L94PgnhkFJCY33K5Vwk1vhffckmjgf5f";
const SUBGRAPH_API_KEY = process.env.SUBGRAPH_API_KEY ?? "";

// DAEMON_URL is now only used for lightweight internal API calls (DB sync),
// not for on-chain operations. On-chain ops use OWNER_PK directly.
const DAEMON_URL =
  process.env.DAEMON_URL ?? process.env.BASE_URL ?? "http://localhost:3001";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

const RPC_URL =
  process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const OWNER_PK = process.env.OWNER_PK;

const VENICE_API_KEY = process.env.VENICE_API_KEY ?? "";

const DURATIONS: CreateAuctionDuration[] = ["5m", "15m", "30m", "1h"];

const SECRET_POOL = [
  "YES",
  "NO",
  "The answer is YES.",
  "The answer is NO.",
  "Prediction: YES",
  "Prediction: NO",
];

// ─── AI-researched secret generation ────────────────────────────────────────

type SecretFormat = "text" | "txt" | "md" | "json";
const SECRET_FORMATS: { format: SecretFormat; weight: number }[] = [
  { format: "text", weight: 30 },
  { format: "txt", weight: 30 },
  { format: "md", weight: 20 },
  { format: "json", weight: 20 },
];

function pickWeightedFormat(): SecretFormat {
  const total = SECRET_FORMATS.reduce((sum, f) => sum + f.weight, 0);
  let r = Math.random() * total;
  for (const { format, weight } of SECRET_FORMATS) {
    r -= weight;
    if (r <= 0) return format;
  }
  return "text";
}

const ResearchAnswerSchema = z.object({
  prediction: z.enum(["yes", "no"]),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  sources: z.array(z.string()).optional(),
});

async function researchEventAnswer(
  venice: OpenAI,
  question: string,
): Promise<{ prediction: boolean; content: string; format: SecretFormat }> {
  const format = pickWeightedFormat();

  const systemPrompt = `You are a research assistant that determines the actual outcome of past events phrased as prediction market questions. Search the web for the answer.

Respond with a JSON object containing:
- "prediction": "yes" or "no" — the actual outcome
- "confidence": 0-100 — your confidence level
- "reasoning": a detailed explanation with citations and source URLs
- "sources": array of source URLs

The events are phrased in future tense but they already happened. Determine what actually occurred.`;

  try {
    const response = await venice.chat.completions.create({
      model: "openai-gpt-54",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `What is the actual outcome of: "${question}"` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");

    const parsed = ResearchAnswerSchema.parse(JSON.parse(raw));
    const prediction = parsed.prediction === "yes";

    let content: string;
    switch (format) {
      case "json":
        content = JSON.stringify(parsed, null, 2);
        break;
      case "md":
        content = `# Research: ${question}\n\n## Prediction: ${parsed.prediction.toUpperCase()}\n\n**Confidence:** ${parsed.confidence}%\n\n## Reasoning\n\n${parsed.reasoning}\n\n## Sources\n\n${(parsed.sources ?? []).map((s) => `- ${s}`).join("\n") || "No sources cited."}`;
        break;
      default:
        content = `Prediction: ${parsed.prediction.toUpperCase()}\nConfidence: ${parsed.confidence}%\n\n${parsed.reasoning}${parsed.sources?.length ? "\n\nSources:\n" + parsed.sources.join("\n") : ""}`;
        break;
    }

    return { prediction, content, format };
  } catch (err) {
    console.warn(`[spawn-auctions] AI research failed: ${err instanceof Error ? err.message : err}`);
    const prediction = Math.random() > 0.5;
    return {
      prediction,
      content: prediction ? "The answer is YES." : "The answer is NO.",
      format: "text",
    };
  }
}

// ---------------------------------------------------------------------------
// ntfy (optional)
// ---------------------------------------------------------------------------

const ENABLE_NTFY = process.env.ENABLE_NTFY === "true";
const NTFY_HOST = process.env.NTFY_HOST ?? "http://localhost:8090";
const NTFY_TOPIC = process.env.NTFY_TOPIC_SPAWN_AUCTIONS ?? "zama-script-spawn-auctions";
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

function nowTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Daemon internal API helpers (lightweight DB sync, no FHE/rate limits)
// ---------------------------------------------------------------------------

async function internalPost(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const response = await fetch(`${DAEMON_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": INTERNAL_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await response.json()) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}

async function registerUser(address: string): Promise<string> {
  const result = await internalPost("/internal/register-user", { address });
  if (!result.ok) {
    throw new Error(`register-user failed: ${JSON.stringify(result.data)}`);
  }
  return result.data.userId as string;
}

// ---------------------------------------------------------------------------
// On-chain interaction (direct via OWNER_PK)
//
// Duplicated from daemon marketplace.ts to offload FHE operations to a
// separate VPS, avoiding Zama relayer rate limit contention with the
// daemon API VPS.
// ---------------------------------------------------------------------------

function getOwnerClients() {
  if (!OWNER_PK) throw new Error("OWNER_PK is required");
  const pk = normalizePrivateKey(OWNER_PK);
  const account = privateKeyToAccount(pk);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL, { timeout: 30_000 }),
  });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL, { timeout: 30_000 }),
  });
  return { walletClient, publicClient, account };
}

function toHexBytes(bytes: Uint8Array): `0x${string}` {
  return toHex(bytes);
}

/** Wait for tx receipt with retry for "indexing in progress" errors. */
async function waitForReceipt(
  publicClient: ReturnType<typeof createPublicClient>,
  hash: `0x${string}`,
  maxAttempts = 10,
) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await publicClient.waitForTransactionReceipt({ hash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("indexing is in progress") && i < maxAttempts - 1) {
        console.log(`[spawn-auctions] Tx receipt pending (attempt ${i + 1}/${maxAttempts}), retrying in 5s...`);
        await new Promise((r) => setTimeout(r, 5_000));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Transaction receipt not available after ${maxAttempts} attempts`);
}

async function createAuctionOnChain(
  sellerId: string,
  eventId: number,
  eventTitle: string,
  endTime: number,
  prediction: boolean,
  secretPayload: string,
): Promise<{ auctionId: number; txHash: string }> {
  const { walletClient, publicClient, account } = getOwnerClients();
  const marketplaceAddress = SECRET_MARKETPLACE_ADDRESS as `0x${string}`;

  // Generate secret data CID (SHA256 of payload) and random secret key
  const secretDataCid = "0x" + createHash("sha256").update(secretPayload).digest("hex");
  const secretDataKey = "0x" + randomBytes(32).toString("hex");

  // FHE-encrypt prediction (bool) + secretKey (uint256)
  console.log(`[spawn-auctions] FHE-encrypting auction inputs...`);
  const encrypted = await encryptAuctionInputs(
    marketplaceAddress,
    account.address,
    prediction,
    BigInt(secretDataKey),
    RPC_URL,
  );

  // Submit createAuction on-chain
  console.log(`[spawn-auctions] submitting createAuction tx...`);
  const hash = await walletClient.writeContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "createAuction",
    args: [
      sellerId,
      BigInt(eventId),
      eventTitle,
      BigInt(endTime),
      toHexBytes(encrypted.handles[0]),  // prediction (ebool)
      secretDataCid as `0x${string}`,    // secretDataCid (bytes32)
      toHexBytes(encrypted.handles[1]),  // secretKey (euint256)
      toHexBytes(encrypted.inputProof),
    ],
  });
  const receipt = await waitForReceipt(publicClient, hash);

  // Parse AuctionCreated event to get the auction ID
  const mktAddr = marketplaceAddress.toLowerCase();
  let auctionId = -1;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== mktAddr) continue;
    try {
      const decoded = decodeEventLog({
        abi: fheSecretMarketplaceAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "AuctionCreated") {
        auctionId = Number((decoded.args as { auctionId: bigint }).auctionId);
        break;
      }
    } catch {
      // Not our event
    }
  }

  if (auctionId === -1) {
    console.warn(
      `[spawn-auctions] AuctionCreated event NOT found in ${receipt.logs.length} logs. ` +
      `Receipt status: ${receipt.status}, tx: ${receipt.transactionHash}`,
    );
  }

  // Sync secret to daemon SQLite via internal API
  const eventDataJson = JSON.stringify({
    marketplace: "insider-streams",
    event: eventTitle,
    marketId: eventId,
    outcome: prediction ? "yes" : "no",
  });

  try {
    await internalPost("/internal/insert-secret", {
      auctionId,
      sellerId,
      secretDataCid,
      secretDataKey,
      secretData: secretPayload,
      eventData: eventDataJson,
    });
  } catch (err) {
    // Non-fatal: auction is created on-chain even if DB sync fails
    console.warn(`[spawn-auctions] insert-secret sync failed:`, err instanceof Error ? err.message : err);
  }

  return { auctionId, txHash: receipt.transactionHash };
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

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

async function submitAuction(
  ta: TestAccount,
  event: { eventId: string; question: string },
  duration: CreateAuctionDuration,
  durationSeconds: number,
  secretPayload: string,
  prediction: boolean,
): Promise<{ ok: boolean; done: boolean }> {
  const MAX_RETRIES = 2;
  let lastErr = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = attempt * 15_000;
      console.log(`[spawn-auctions] retry ${attempt}/${MAX_RETRIES} in ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    const endTime = nowTimestamp() + durationSeconds;

    try {
      // Register user to get pseudonymous ID
      const sellerId = await registerUser(ta.address);
      console.log(`[spawn-auctions] seller: ${sellerId} (${ta.address.slice(0, 10)}...)`);

      const { auctionId, txHash } = await createAuctionOnChain(
        sellerId,
        Number(event.eventId),
        event.question,
        endTime,
        prediction,
        secretPayload,
      );

      const msg = `Auction ${auctionId} (${duration}) for event ${event.eventId}\n"${event.question}"\ntx: ${txHash.slice(0, 14)}...`;
      console.log(`[spawn-auctions] ${msg}`);
      await ntfy("Auction Created", msg, ["tada"]);
      return { ok: true, done: true };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.warn(`[spawn-auctions] attempt ${attempt}: ${lastErr}`);
    }
  }

  console.error(`[spawn-auctions] giving up on event ${event.eventId} after ${MAX_RETRIES + 1} attempts`);
  await ntfy("Auction Spawn FAILED", `event ${event.eventId}: ${lastErr}`, ["x"]);
  return { ok: false, done: true };
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

  const venice = VENICE_API_KEY
    ? new OpenAI({ apiKey: VENICE_API_KEY, baseURL: "https://api.venice.ai/api/v1" })
    : null;

  const candidates = shuffle(openEvents);
  const ta = pickRandom(accounts);

  for (const event of candidates) {
    console.log(
      `[spawn-auctions] trying event ${event.eventId} — "${event.question}"`,
    );
    console.log(`[spawn-auctions] signer: ${ta.address}`);

    let secretPayload: string;
    let prediction: boolean;

    if (venice) {
      console.log(`[spawn-auctions] researching event via Venice AI...`);
      const research = await researchEventAnswer(venice, event.question);
      secretPayload = research.content;
      prediction = research.prediction;
      console.log(`[spawn-auctions] format: ${research.format}, prediction: ${prediction}, content: ${secretPayload.length} chars`);
    } else {
      secretPayload = pickRandom(SECRET_POOL);
      prediction = secretPayload.includes("YES");
      console.log(`[spawn-auctions] secret: "${secretPayload}" (no Venice AI)`);
    }

    const duration = pickRandom(DURATIONS);
    const durationSeconds = CREATE_AUCTION_DURATION_SECONDS[duration];
    console.log(`[spawn-auctions] duration: ${duration}`);

    const { done } = await submitAuction(
      ta, event, duration, durationSeconds, secretPayload, prediction,
    );
    if (done) return;
  }

  console.log("[spawn-auctions] all candidate events were skipped, nothing created this cycle");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (!OWNER_PK) {
  console.error("[spawn-auctions] OWNER_PK is required — set it in scripts/.env");
  process.exit(1);
}

if (!INTERNAL_API_KEY) {
  console.error("[spawn-auctions] INTERNAL_API_KEY is required — set it in scripts/.env");
  process.exit(1);
}

const accounts = getTestAccounts();
if (accounts.length === 0) {
  console.error(
    "[spawn-auctions] no test accounts found — set TEST_ACCOUNT_1 through TEST_ACCOUNT_25 in scripts/.env",
  );
  process.exit(1);
}

console.log(`[spawn-auctions] loaded ${accounts.length} test account(s)`);
console.log(`[spawn-auctions] daemon (internal API): ${DAEMON_URL}`);
console.log(`[spawn-auctions] rpc: ${RPC_URL}`);
console.log(`[spawn-auctions] subgraph: ${SUBGRAPH_URL}`);
console.log(`[spawn-auctions] venice AI: ${VENICE_API_KEY ? "enabled" : "disabled"}`);

const client = new GraphQLClient(SUBGRAPH_URL, {
  headers: { Authorization: `Bearer ${SUBGRAPH_API_KEY}` },
});

runCycle(client, accounts)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[spawn-auctions] fatal:", err);
    process.exit(1);
  });
