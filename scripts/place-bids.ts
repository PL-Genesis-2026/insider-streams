#!/usr/bin/env tsx
/**
 * place-bids.ts — Debug-only daemon that places bids on open auctions.
 *
 * ⚠️  DEBUG / DEMO USE ONLY ⚠️
 * This script queries the Supabase `private_bids` and `sellers` tables directly
 * to determine who created each auction and who the current highest bidder is.
 * In production that information is intentionally secret. Only use this script
 * to populate the app with test activity.
 *
 * Auto-funding: accounts with no balance or balance below LOW_BALANCE_THRESHOLD
 * are automatically topped up via the Chainlink Private Token REST API
 * (real private CUSDC transfers from the funder account). The balance is
 * reflected in Supabase once the user-balance-recording-fallback CRE workflow
 * picks up the transfer (runs on a ~60 s cron).
 *
 * Flow (each cycle):
 *   1. Top up any test accounts below the low-balance threshold.
 *   2. Query subgraph for open auctions.
 *   3. For each open auction, query Supabase for:
 *        - Seller address (to exclude from bidding)
 *        - Active bid (to determine current highest bidder + current bid amount)
 *   4. Shuffle the open auctions and, for each one, try to find a test account
 *      that is neither the seller nor the current highest bidder and has
 *      sufficient Supabase balance. Place a bid on the first viable pairing.
 *   5. Wait INTERVAL_MS and repeat.
 *
 * Env vars required (scripts/.env):
 *   TEST_ACCOUNT_1..25        — private keys for bidding accounts
 *   FUNDER_PK                 — private key of the account that funds bidders
 *                               (must have private CUSDC balance; falls back to OWNER_PK)
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (bypasses RLS, for reading private bid/seller data)
 *
 * Optional:
 *   BASE_URL                  — frontend origin (default: http://localhost:3000)
 *   INTERVAL_MS               — cycle interval in ms (default: 300000 / 5 min)
 *   ENABLE_NTFY=true          — send notifications via ntfy
 *   NTFY_HOST                 — ntfy server URL (default: http://localhost:8090)
 *   NTFY_TOPIC                — ntfy topic (default: place-bids)
 *   NTFY_USER                 — user tag in notifications (default: unknown)
 */

import stringify from "fast-json-stable-stringify";
import { GraphQLClient, gql } from "graphql-request";
import { createClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, type Hex } from "viem";
import { sepolia } from "viem/chains";
import type { Database } from "@private-streams/common";
import { PRIVATE_CONFIDENTIAL_USDC_ADDRESS } from "@private-streams/common";
import { PrivateTokenApiClient } from "@private-streams/chainlink-private-token-api-client";

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

const MIN_BID_INCREMENT = 10_000_000n;  // 10 USDC (6 decimals)
const MAX_BID_INCREMENT = 50_000_000n;  // 50 USDC

// Auto-funding thresholds (real private CUSDC transfers via Chainlink REST API)
const LOW_BALANCE_THRESHOLD = 100_000_000n;   // 100 USDC — top up below this
const TOP_UP_AMOUNT = 10_000_000_000n;         // 10,000 USDC per top-up

// ntfy (optional push notifications)
const ENABLE_NTFY = process.env.ENABLE_NTFY === "true";
const NTFY_HOST = process.env.NTFY_HOST ?? "http://localhost:8090";
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "place-bids";
const NTFY_USER = process.env.NTFY_USER ?? "unknown";

async function ntfy(title: string, message: string, tags?: string[]): Promise<void> {
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
    console.error(`[place-bids] [ntfy] Failed to send notification: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function randomBigIntBetween(min: bigint, max: bigint): bigint {
  const range = max - min + 1n;
  return min + BigInt(Math.floor(Math.random() * Number(range)));
}

function normalizePrivateKey(value: string): Hex {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error(`Invalid private key: ${value.slice(0, 10)}...`);
  }
  return normalized as Hex;
}

function getTestAccounts(): { pk: Hex; address: string }[] {
  const accounts: { pk: Hex; address: string }[] = [];
  for (let i = 1; i <= 25; i++) {
    const raw = process.env[`TEST_ACCOUNT_${i}`];
    if (raw) {
      try {
        const pk = normalizePrivateKey(raw);
        const address = privateKeyToAccount(pk).address.toLowerCase();
        accounts.push({ pk, address });
      } catch {
        console.warn(`[place-bids] TEST_ACCOUNT_${i} is invalid, skipping`);
      }
    }
  }
  return accounts;
}

function timestamp(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

const OPEN_AUCTIONS_QUERY = gql`
  {
    auctions(first: 100, where: { status: Open }, orderBy: auctionId, orderDirection: desc) {
      auctionId
      sellerId
      endTime
    }
  }
`;

type OpenAuctionsResponse = {
  auctions: { auctionId: string; sellerId: string; endTime: string }[];
};

async function fetchOpenAuctions(
  client: GraphQLClient,
): Promise<{ auctionId: string; sellerId: string }[]> {
  const now = Math.floor(Date.now() / 1000);
  const data = await client.request<OpenAuctionsResponse>(OPEN_AUCTIONS_QUERY);
  // Also filter by endTime client-side in case the subgraph lags
  return data.auctions.filter((a) => Number(a.endTime) > now);
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

type SupabaseClient = ReturnType<typeof createClient<Database>>;

async function getSellerAddress(
  supabase: SupabaseClient,
  sellerId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("sellers")
    .select("address")
    .eq("id", sellerId)
    .maybeSingle();
  return data?.address?.toLowerCase() ?? null;
}

async function getActiveBid(
  supabase: SupabaseClient,
  auctionId: string,
): Promise<{ bidder_address: string; amount: string } | null> {
  const { data } = await supabase
    .from("private_bids")
    .select("bidder_address, amount")
    .eq("auction_id", auctionId)
    .eq("status", "active")
    .maybeSingle();
  return data ?? null;
}

async function getAvailableBalance(
  supabase: SupabaseClient,
  address: string,
): Promise<bigint> {
  const { data } = await supabase
    .from("balances")
    .select("available_balance")
    .eq("user_address", address)
    .maybeSingle();
  if (!data?.available_balance) return 0n;
  try {
    return BigInt(data.available_balance);
  } catch {
    return 0n;
  }
}

/**
 * Transfer private CUSDC from the funder account to a bidding account via the
 * Chainlink Private Token REST API. The transfer is real — no DB writes.
 * The balance will appear in Supabase once the user-balance-recording-fallback
 * CRE workflow reconciles it (runs on a ~60 s cron).
 */
async function topUpAccount(
  funderClient: PrivateTokenApiClient,
  address: string,
): Promise<void> {
  try {
    const result = await funderClient.privateTransfer({
      recipient: address,
      token: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
      amount: TOP_UP_AMOUNT.toString(),
    });
    const msg = `+${TOP_UP_AMOUNT / 1_000_000n} USDC → ${address} (tx: ${result.transaction_id})`;
    console.log(`[place-bids] topped up ${msg}`);
    await ntfy("Account topped up", msg, ["money_with_wings"]);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[place-bids] top-up failed for ${address}: ${errMsg}`);
    await ntfy("Top-up failed", `${address}: ${errMsg}`, ["rotating_light"]);
  }
}

/**
 * Check every test account and top up those below LOW_BALANCE_THRESHOLD.
 * Called at the start of each cycle so accounts are always ready to bid.
 */
async function topUpLowAccounts(
  supabase: SupabaseClient,
  funderClient: PrivateTokenApiClient,
  accounts: { pk: Hex; address: string }[],
): Promise<void> {
  for (const account of accounts) {
    const balance = await getAvailableBalance(supabase, account.address);
    if (balance < LOW_BALANCE_THRESHOLD) {
      await topUpAccount(funderClient, account.address);
    }
  }
}

// ---------------------------------------------------------------------------
// Bid placement
// ---------------------------------------------------------------------------

async function placeBid(
  pk: Hex,
  auctionId: string,
  amount: bigint,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const account = privateKeyToAccount(pk);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(),
  });

  const ts = timestamp();
  const payload = { auctionId, amount: amount.toString(), timestamp: ts };
  const signature = await walletClient.signMessage({
    account,
    message: stringify(payload),
  });

  const body = { ...payload, signature };

  const response = await fetch(`${BASE_URL}/api/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep raw text
  }

  return { ok: response.ok, status: response.status, body: parsed };
}

// ---------------------------------------------------------------------------
// Skippable response codes (move on to next auction rather than bailing)
// ---------------------------------------------------------------------------

const SKIPPABLE_CODES = new Set([
  "AUCTION_NOT_FOUND",
  "AUCTION_NOT_OPEN",
  "ALREADY_HIGHEST",
  "SELF_BID_NOT_ALLOWED",
  "NO_BALANCE",
  "INSUFFICIENT_BALANCE",
  "BID_TOO_LOW",
]);

// ---------------------------------------------------------------------------
// Main cycle
// ---------------------------------------------------------------------------

async function runCycle(
  graphqlClient: GraphQLClient,
  supabase: SupabaseClient,
  funderClient: PrivateTokenApiClient,
  accounts: { pk: Hex; address: string }[],
): Promise<void> {
  const label = new Date().toISOString();
  console.log(`[place-bids] ${label} — starting cycle`);

  // ── Top up any accounts running low before doing anything else ───────────
  await topUpLowAccounts(supabase, funderClient, accounts);

  let openAuctions: { auctionId: string; sellerId: string }[];
  try {
    openAuctions = await fetchOpenAuctions(graphqlClient);
  } catch (err) {
    console.error("[place-bids] subgraph query failed:", err);
    return;
  }

  if (openAuctions.length === 0) {
    console.log("[place-bids] no open auctions, skipping");
    return;
  }

  console.log(`[place-bids] ${openAuctions.length} open auction(s)`);

  for (const auction of shuffle(openAuctions)) {
    // ── Get seller address so we can exclude them ─────────────────────────
    const sellerAddress = await getSellerAddress(supabase, auction.sellerId);

    // ── Get current active bid (debug: this data is normally private) ─────
    const activeBid = await getActiveBid(supabase, auction.auctionId);
    const currentBidAmount = activeBid ? BigInt(activeBid.amount) : 0n;
    const currentHighestBidder = activeBid?.bidder_address ?? null;

    const bidAmount =
      currentBidAmount + randomBigIntBetween(MIN_BID_INCREMENT, MAX_BID_INCREMENT);

    // ── Find a viable test account ────────────────────────────────────────
    const candidates = shuffle(accounts).filter(
      (a) =>
        a.address !== sellerAddress &&
        a.address !== currentHighestBidder,
    );

    if (candidates.length === 0) {
      console.log(
        `[place-bids] auction ${auction.auctionId}: no eligible accounts (all are seller or highest bidder), skipping`,
      );
      continue;
    }

    // Pick first candidate with sufficient balance (all should be topped up)
    let chosenAccount: { pk: Hex; address: string } | null = null;
    for (const candidate of candidates) {
      const balance = await getAvailableBalance(supabase, candidate.address);
      if (balance >= bidAmount) {
        chosenAccount = candidate;
        break;
      }
    }

    if (!chosenAccount) {
      // Shouldn't happen after top-up, but fall back gracefully
      chosenAccount = pickRandom(candidates);
      console.log(
        `[place-bids] auction ${auction.auctionId}: no account with sufficient balance after top-up, trying anyway`,
      );
    }

    console.log(`[place-bids] auction ${auction.auctionId} — bidder: ${chosenAccount.address}`);
    console.log(
      `[place-bids]   current bid: ${currentBidAmount} | new bid: ${bidAmount}`,
    );

    try {
      const result = await placeBid(chosenAccount.pk, auction.auctionId, bidAmount);

      if (result.ok) {
        const bidId =
          result.body != null &&
          typeof result.body === "object" &&
          "bidId" in result.body
            ? (result.body as Record<string, unknown>).bidId
            : "(unknown)";
        console.log(`[place-bids] bid placed — id: ${bidId}`);
        await ntfy(
          "Bid placed",
          `Auction ${auction.auctionId} — ${bidAmount / 1_000_000n} USDC by ${chosenAccount.address} (bid ${bidId})`,
          ["moneybag"],
        );
        return; // one bid per cycle
      }

      const code =
        result.body != null &&
        typeof result.body === "object" &&
        "code" in result.body
          ? String((result.body as Record<string, unknown>).code)
          : undefined;

      if (result.status < 500 && code && SKIPPABLE_CODES.has(code)) {
        console.log(
          `[place-bids] auction ${auction.auctionId} skipped (${code}), trying next`,
        );
        continue;
      }

      const errBody = JSON.stringify(result.body);
      console.error(`[place-bids] bid failed (HTTP ${result.status}):`, result.body);
      await ntfy(
        "Bid failed",
        `HTTP ${result.status} on auction ${auction.auctionId}: ${errBody}`,
        ["rotating_light"],
      );
      return;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[place-bids] bid request threw:", err);
      await ntfy("Bid error", errMsg, ["rotating_light"]);
      return;
    }
  }

  console.log("[place-bids] all auctions skipped this cycle");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "[place-bids] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in scripts/.env",
  );
  process.exit(1);
}

const funderPk = process.env.FUNDER_PK ?? process.env.OWNER_PK;
if (!funderPk) {
  console.error(
    "[place-bids] FUNDER_PK (or OWNER_PK) is required — the funder account must hold private CUSDC",
  );
  process.exit(1);
}

const accounts = getTestAccounts();
if (accounts.length === 0) {
  console.error(
    "[place-bids] no test accounts found — set TEST_ACCOUNT_1 through TEST_ACCOUNT_25 in scripts/.env",
  );
  process.exit(1);
}

const funderClient = new PrivateTokenApiClient(funderPk);

console.log(`[place-bids] loaded ${accounts.length} test account(s)`);
console.log(`[place-bids] funder: ${funderClient.account}`);
console.log(`[place-bids] base URL: ${BASE_URL}`);
console.log(`[place-bids] interval: ${INTERVAL_MS / 1000}s`);
console.log(`[place-bids] subgraph: ${SUBGRAPH_URL}`);
console.warn(`[place-bids] ⚠️  DEBUG MODE: querying private bid/seller data directly from Supabase`);

const supabase = createClient<Database>(supabaseUrl, supabaseKey);
const graphqlClient = new GraphQLClient(SUBGRAPH_URL);

runCycle(graphqlClient, supabase, funderClient, accounts);
const timer = setInterval(
  () => runCycle(graphqlClient, supabase, funderClient, accounts),
  INTERVAL_MS,
);

function shutdown(): void {
  console.log("\n[place-bids] shutting down");
  clearInterval(timer);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
