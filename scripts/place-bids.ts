#!/usr/bin/env tsx
/**
 * place-bids.ts — Demo daemon that places bids on open auctions.
 *
 * Uses the daemon HTTP API (not Supabase) to place bids and check balances.
 * Runs once per invocation; scheduling is handled by run-demo.sh.
 *
 * Flow:
 *   1. Load test accounts from env (TEST_ACCOUNT_1..25)
 *   2. Query subgraph for open auctions
 *   3. For each auction, find a test account that isn't the seller
 *   4. Check balance via daemon /balance, top up via /faucet + /deposit if needed
 *   5. Place bid via daemon /bid
 *
 * Env vars (scripts/.env):
 *   TEST_ACCOUNT_1..25  — private keys for bidding accounts
 *   DAEMON_URL / BASE_URL — daemon origin (default: http://localhost:3001)
 *   SUBGRAPH_URL        — subgraph endpoint (default: insider-streams-zama)
 */

import stringify from "fast-json-stable-stringify";
import { GraphQLClient, gql } from "graphql-request";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { sepolia } from "viem/chains";
import {
  CONFIDENTIAL_USDC_ADDRESS,
  fheConfidentialUsdcAbi,
} from "@private-streams/common";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUBGRAPH_URL =
  process.env.SUBGRAPH_URL ??
  "https://gateway.thegraph.com/api/subgraphs/id/BttcQ7pVTEz7L94PgnhkFJCY33K5Vwk1vhffckmjgf5f";
const SUBGRAPH_API_KEY = process.env.SUBGRAPH_API_KEY ?? "";

const DAEMON_URL =
  process.env.DAEMON_URL ?? process.env.BASE_URL ?? "http://localhost:3001";

const RPC_URL =
  process.env.RPC_URL ??
  "https://ethereum-sepolia-rpc.publicnode.com";

const OWNER_PK = process.env.OWNER_PK;

const MIN_BID_INCREMENT = 10_000_000n; // 10 USDC (6 decimals)
const MAX_BID_INCREMENT = 50_000_000n; // 50 USDC
const LOW_BALANCE_THRESHOLD = 100_000_000n; // 100 USDC
const TOPUP_AMOUNT = 1_000_000_000n; // 1000 USDC — large topup to reduce frequency

// ---------------------------------------------------------------------------
// ntfy (optional)
// ---------------------------------------------------------------------------

const ENABLE_NTFY = process.env.ENABLE_NTFY === "true";
const NTFY_HOST = process.env.NTFY_HOST ?? "http://localhost:8090";
const NTFY_TOPIC = process.env.NTFY_TOPIC_PLACE_BIDS ?? "zama-script-place-bids";
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
  } catch {
    /* non-fatal */
  }
}

// ---------------------------------------------------------------------------
// Test accounts
// ---------------------------------------------------------------------------

interface TestAccount {
  privateKey: Hex;
  address: string;
  account: ReturnType<typeof privateKeyToAccount>;
}

function loadTestAccounts(): TestAccount[] {
  const accounts: TestAccount[] = [];
  for (let i = 1; i <= 25; i++) {
    const pk = process.env[`TEST_ACCOUNT_${i}`];
    if (!pk) continue;
    const account = privateKeyToAccount(pk as Hex);
    accounts.push({
      privateKey: pk as Hex,
      address: account.address,
      account,
    });
  }
  return accounts;
}

// ---------------------------------------------------------------------------
// Daemon API helpers
// ---------------------------------------------------------------------------

async function signedPost(
  account: TestAccount,
  endpoint: string,
  fields: Record<string, unknown> = {},
): Promise<Response> {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = { ...fields, timestamp };
  const message = stringify(payload);
  const signature = await account.account.signMessage({ message });

  return fetch(`${DAEMON_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, signature }),
    signal: AbortSignal.timeout(120_000),
  });
}

// Owner wallet for direct minting (avoids daemon faucet round-trip)
function getOwnerClients() {
  if (!OWNER_PK) return null;
  const account = privateKeyToAccount(OWNER_PK as Hex);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });
  return { walletClient, publicClient, address: account.address };
}
const ownerClients = getOwnerClients();

async function ensureBalance(account: TestAccount): Promise<bigint> {
  // Register user first (idempotent)
  await signedPost(account, "/user");

  // Check marketplace balance via daemon
  const balResp = await signedPost(account, "/balance");
  const balData = (await balResp.json()) as { balance?: string };
  const balance = BigInt(balData.balance ?? "0");

  if (balance >= LOW_BALANCE_THRESHOLD) {
    return balance;
  }

  console.log(
    `  [place-bids] ${account.address.slice(0, 10)}... balance ${balance} < threshold, topping up`,
  );

  // Mint cUSDC directly to admin via OWNER_PK, then deposit via daemon
  if (!ownerClients) {
    console.warn(`  [place-bids] OWNER_PK not set, cannot mint — skipping topup`);
    return balance;
  }

  try {
    // Step 1: Mint cUSDC to admin address
    const mintHash = await ownerClients.walletClient.writeContract({
      address: CONFIDENTIAL_USDC_ADDRESS as `0x${string}`,
      abi: fheConfidentialUsdcAbi,
      functionName: "mintPlaintext",
      args: [ownerClients.address, TOPUP_AMOUNT],
    });
    await ownerClients.publicClient.waitForTransactionReceipt({ hash: mintHash });
    console.log(`  [place-bids] minted ${TOPUP_AMOUNT} cUSDC to admin (tx: ${mintHash.slice(0, 10)}...)`);

    // Step 2: Deposit into marketplace for the user via daemon API
    const depositResp = await signedPost(account, "/deposit", {
      amount: TOPUP_AMOUNT.toString(),
    });
    if (!depositResp.ok) {
      const err = (await depositResp.json().catch(() => ({ error: depositResp.statusText }))) as { error?: string };
      console.warn(`  [place-bids] deposit failed: ${err.error}`);
    } else {
      console.log(`  [place-bids] deposited ${TOPUP_AMOUNT} for ${account.address.slice(0, 10)}...`);
    }

    return TOPUP_AMOUNT + balance;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  [place-bids] topup failed for ${account.address.slice(0, 10)}...: ${msg.slice(0, 100)}`);
    return balance;
  }
}

// ---------------------------------------------------------------------------
// Subgraph
// ---------------------------------------------------------------------------

const OPEN_AUCTIONS_QUERY = gql`
  query OpenAuctions($now: BigInt!) {
    auctionCreateds(
      where: { endTime_gt: $now }
      first: 100
      orderBy: endTime
      orderDirection: asc
    ) {
      auctionId
      sellerId
      eventTitle
      endTime
    }
  }
`;

type OpenAuctionsResponse = {
  auctionCreateds: {
    auctionId: string;
    sellerId: string;
    eventTitle: string;
    endTime: string;
  }[];
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("[place-bids] starting...");
  console.log(`[place-bids] daemon: ${DAEMON_URL}`);
  console.log(`[place-bids] subgraph: ${SUBGRAPH_URL}`);

  const accounts = loadTestAccounts();
  if (accounts.length === 0) {
    console.error(
      "[place-bids] No test accounts found (TEST_ACCOUNT_1..25)",
    );
    process.exit(1);
  }
  console.log(`[place-bids] Loaded ${accounts.length} test account(s)`);

  const gqlClient = new GraphQLClient(SUBGRAPH_URL, {
    headers: { Authorization: `Bearer ${SUBGRAPH_API_KEY}` },
  });
  const now = Math.floor(Date.now() / 1000).toString();

  let auctions: OpenAuctionsResponse["auctionCreateds"];
  try {
    const data = await gqlClient.request<OpenAuctionsResponse>(
      OPEN_AUCTIONS_QUERY,
      { now },
    );
    auctions = data.auctionCreateds;
  } catch (err) {
    console.error("[place-bids] subgraph query failed:", err);
    process.exit(1);
  }

  if (auctions.length === 0) {
    console.log("[place-bids] No open auctions found");
    return;
  }

  console.log(`[place-bids] Found ${auctions.length} open auction(s)`);

  const FRONTEND_URL = "https://insider-streams-insider-streams-fro.vercel.app";

  // Shuffle and pick up to 5 random auctions per run
  for (let i = auctions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [auctions[i], auctions[j]] = [auctions[j], auctions[i]];
  }
  auctions = auctions.slice(0, 5);

  let bidsPlaced = 0;
  let skippedLowBalance = 0;
  let rejectedBids = 0;
  let errors = 0;
  const rejectReasons: string[] = [];
  const errorMessages: string[] = [];
  const successDetails: string[] = [];

  for (const auction of auctions) {
    // Pick a random account — daemon uses pseudonymous IDs so we can't
    // easily check if this account is the seller. The daemon will reject
    // if it's the same user.
    const account = accounts[Math.floor(Math.random() * accounts.length)];

    try {
      const balance = await ensureBalance(account);
      if (balance < MIN_BID_INCREMENT) {
        console.log(
          `  [place-bids] Skipping auction ${auction.auctionId} — insufficient balance`,
        );
        skippedLowBalance++;
        continue;
      }

      // Random bid amount between MIN and MAX increment
      const range = MAX_BID_INCREMENT - MIN_BID_INCREMENT;
      const bidAmount =
        MIN_BID_INCREMENT +
        BigInt(Math.floor(Math.random() * Number(range)));

      console.log(
        `  [place-bids] Bidding ${bidAmount} on auction ${auction.auctionId} from ${account.address.slice(0, 10)}...`,
      );

      const resp = await signedPost(account, "/bid", {
        auctionId: auction.auctionId,
        amount: bidAmount.toString(),
      });

      if (resp.ok) {
        const data = (await resp.json()) as {
          bidId?: number;
          status?: string;
        };
        console.log(
          `  [place-bids] Bid placed: bidId=${data.bidId}, status=${data.status}`,
        );
        bidsPlaced++;
        const usdcAmount = (Number(bidAmount) / 1e6).toFixed(0);
        successDetails.push(
          `  ${account.address.slice(0, 6)}.. bid $${usdcAmount} on #${auction.auctionId}` +
          (auction.eventTitle ? ` — ${auction.eventTitle.slice(0, 50)}` : "") +
          `\n  ${FRONTEND_URL}/auction/${auction.auctionId}`,
        );
      } else {
        const err = (await resp.json().catch(() => ({
          error: resp.statusText,
        }))) as { error?: string };
        console.warn(
          `  [place-bids] Bid rejected for auction ${auction.auctionId}: ${err.error}`,
        );
        rejectedBids++;
        if (err.error && rejectReasons.length < 3) {
          rejectReasons.push(`#${auction.auctionId}: ${err.error.slice(0, 80)}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `  [place-bids] Error on auction ${auction.auctionId}:`, msg,
      );
      errors++;
      if (errorMessages.length < 3) {
        errorMessages.push(`#${auction.auctionId}: ${msg.slice(0, 80)}`);
      }
    }
  }

  const lines = [`Placed ${bidsPlaced} bid(s) across ${auctions.length} auction(s)`];
  if (successDetails.length > 0) lines.push(...successDetails);
  if (skippedLowBalance > 0) lines.push(`Skipped (low balance): ${skippedLowBalance}`);
  if (rejectedBids > 0) lines.push(`Rejected: ${rejectedBids}`);
  if (errors > 0) lines.push(`Errors: ${errors}`);
  if (rejectReasons.length > 0) lines.push(`Rejects:\n${rejectReasons.join("\n")}`);
  if (errorMessages.length > 0) lines.push(`Errors:\n${errorMessages.join("\n")}`);
  const summary = lines.join("\n");
  console.log(`[place-bids] ${summary}`);
  await ntfy(
    bidsPlaced > 0 ? "Bids Placed" : "Bids Placed (none)",
    summary,
    bidsPlaced > 0 ? ["white_check_mark"] : ["warning"],
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[place-bids] fatal:", err);
    ntfy("Place Bids FATAL", `${err}`, ["x"]).finally(() => process.exit(1));
  });
