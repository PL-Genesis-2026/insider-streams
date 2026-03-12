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
import { type Hex } from "viem";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUBGRAPH_URL =
  process.env.SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/1743303/insider-streams-zama/version/latest";

const DAEMON_URL =
  process.env.DAEMON_URL ?? process.env.BASE_URL ?? "http://localhost:3001";

const MIN_BID_INCREMENT = 10_000_000n; // 10 USDC (6 decimals)
const MAX_BID_INCREMENT = 50_000_000n; // 50 USDC
const LOW_BALANCE_THRESHOLD = 100_000_000n; // 100 USDC

// ---------------------------------------------------------------------------
// ntfy (optional)
// ---------------------------------------------------------------------------

const ENABLE_NTFY = process.env.ENABLE_NTFY === "true";
const NTFY_HOST = process.env.NTFY_HOST ?? "http://localhost:8090";
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "place-bids";
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
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = { ...fields, timestamp };
  const message = stringify(payload);
  const signature = await account.account.signMessage({ message });

  return fetch(`${DAEMON_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, signature }),
    signal: AbortSignal.timeout(30_000),
  });
}

async function ensureBalance(account: TestAccount): Promise<bigint> {
  // Register user first (idempotent)
  await signedPost(account, "/user");

  // Check balance
  const balResp = await signedPost(account, "/balance");
  const balData = (await balResp.json()) as { balance?: string };
  const balance = BigInt(balData.balance ?? "0");

  if (balance < LOW_BALANCE_THRESHOLD) {
    console.log(
      `  [place-bids] ${account.address.slice(0, 10)}... balance ${balance} < threshold, topping up via faucet + deposit`,
    );

    // Mint MockUSDC via faucet
    const faucetResp = await signedPost(account, "/faucet");
    if (!faucetResp.ok) {
      console.warn(
        `  [place-bids] faucet failed for ${account.address.slice(0, 10)}...`,
      );
      return balance;
    }
    const faucetData = (await faucetResp.json()) as {
      amount?: string;
      txHash?: string;
    };
    const mintAmount = faucetData.amount ?? "1000000000";

    // Deposit into marketplace
    const depositResp = await signedPost(account, "/deposit", {
      amount: mintAmount,
    });
    if (!depositResp.ok) {
      console.warn(
        `  [place-bids] deposit failed for ${account.address.slice(0, 10)}...`,
      );
    }

    return BigInt(mintAmount) + balance;
  }

  return balance;
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
      endTime
    }
  }
`;

type OpenAuctionsResponse = {
  auctionCreateds: {
    auctionId: string;
    sellerId: string;
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

  const gqlClient = new GraphQLClient(SUBGRAPH_URL);
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

  // Shuffle auctions for variety
  for (let i = auctions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [auctions[i], auctions[j]] = [auctions[j], auctions[i]];
  }

  let bidsPlaced = 0;

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
      } else {
        const err = (await resp.json().catch(() => ({
          error: resp.statusText,
        }))) as { error?: string };
        console.warn(
          `  [place-bids] Bid rejected for auction ${auction.auctionId}: ${err.error}`,
        );
      }
    } catch (err) {
      console.error(
        `  [place-bids] Error on auction ${auction.auctionId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const summary = `Placed ${bidsPlaced} bid(s) across ${auctions.length} auction(s)`;
  console.log(`[place-bids] ${summary}`);
  await ntfy(
    "Bids Placed",
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
