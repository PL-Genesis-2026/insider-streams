#!/usr/bin/env tsx
/**
 * place-bids.ts — Place bids on open auctions.
 *
 * Performs FHE encryption and on-chain contract calls directly via OWNER_PK
 * (admin EOA), bypassing the daemon HTTP API. This lets the scripts VPS run
 * its own Zama relayer rate limit bucket independently from the API VPS.
 *
 * Daemon SQLite is kept in sync via lightweight internal API calls
 * (/internal/register-user, /internal/record-bid) which don't touch
 * the Zama relayer.
 *
 * Runs once per invocation; scheduling is handled by cron.
 *
 * Flow:
 *   1. Load test accounts from env (TEST_ACCOUNT_1..25)
 *   2. Query subgraph for open auctions
 *   3. For each auction, find a test account that isn't the seller
 *   4. Read on-chain balance, top up via mint + depositFor if needed
 *   5. FHE-encrypt bid amount, call placeBid on-chain
 *   6. Sync bid record to daemon SQLite via internal API
 *
 * Env vars (scripts/.env):
 *   OWNER_PK                — admin EOA private key (submits all on-chain txs)
 *   RPC_URL                 — Ethereum RPC URL (default: publicnode Sepolia)
 *   INTERNAL_API_KEY        — shared secret for daemon internal API
 *   DAEMON_URL / BASE_URL   — daemon origin for internal API (default: http://localhost:3001)
 *   TEST_ACCOUNT_1..25      — private keys for bidding accounts (identity only)
 *   SUBGRAPH_URL            — subgraph endpoint (default: insider-streams-zama)
 */

import { GraphQLClient, gql } from "graphql-request";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http, toHex, zeroHash, type Hex } from "viem";
import { sepolia } from "viem/chains";
import {
  CONFIDENTIAL_USDC_ADDRESS,
  SECRET_MARKETPLACE_ADDRESS,
  fheConfidentialUsdcAbi,
  fheSecretMarketplaceAbi,
  encryptUint64,
  getFhevmInstance,
} from "@private-streams/common";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUBGRAPH_URL =
  process.env.SUBGRAPH_URL ??
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
  address: `0x${string}`;
  account: ReturnType<typeof privateKeyToAccount>;
}

function loadTestAccounts(): TestAccount[] {
  const accounts: TestAccount[] = [];
  for (let i = 1; i <= 25; i++) {
    const pk = process.env[`TEST_ACCOUNT_${i}`];
    if (!pk) continue;
    const normalized = pk.startsWith("0x") ? pk : `0x${pk}`;
    const account = privateKeyToAccount(normalized as Hex);
    accounts.push({
      privateKey: normalized as Hex,
      address: account.address,
      account,
    });
  }
  return accounts;
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
  const pk = (OWNER_PK.startsWith("0x") ? OWNER_PK : `0x${OWNER_PK}`) as Hex;
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
        console.log(`[place-bids] Tx receipt pending (attempt ${i + 1}/${maxAttempts}), retrying in 5s...`);
        await new Promise((r) => setTimeout(r, 5_000));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Transaction receipt not available after ${maxAttempts} attempts`);
}

const DECRYPT_TIMEOUT_MS = 60_000;

async function getOnChainBalance(userId: string): Promise<bigint> {
  const { publicClient } = getOwnerClients();
  const marketplaceAddress = SECRET_MARKETPLACE_ADDRESS as `0x${string}`;

  // Get the handle — if zero, user has no balance
  const rawHandle = await publicClient.readContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "getBalance",
    args: [userId],
  });
  const handle = rawHandle as `0x${string}`;
  if (!handle || handle === zeroHash) return 0n;

  const instance = await getFhevmInstance(RPC_URL);

  // Try publicDecrypt directly first (fast path).
  // If handle not allowed for public decryption, submit requestBalanceDecrypt
  // on-chain and retry.
  try {
    const result = await publicDecryptWithTimeout(instance, handle);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("not allowed for public decryption")) {
      throw err;
    }
    console.log(`[place-bids] Handle not yet allowed, submitting requestBalanceDecrypt...`);
  }

  // Slow path: submit requestBalanceDecrypt on-chain, then retry
  const { walletClient } = getOwnerClients();
  const decryptTxHash = await walletClient.writeContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "requestBalanceDecrypt",
    args: [userId],
  });
  const { publicClient: pc2 } = getOwnerClients();
  await waitForReceipt(pc2, decryptTxHash);

  return publicDecryptWithTimeout(instance, handle);
}

async function publicDecryptWithTimeout(
  instance: Awaited<ReturnType<typeof getFhevmInstance>>,
  handle: `0x${string}`,
): Promise<bigint> {
  console.log(`[place-bids] publicDecrypt(${handle.slice(0, 14)}...) — waiting for relayer...`);

  const decryptPromise = instance.publicDecrypt([handle]);
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`publicDecrypt timed out after ${DECRYPT_TIMEOUT_MS / 1000}s`)), DECRYPT_TIMEOUT_MS);
  });
  let result;
  try {
    result = await Promise.race([decryptPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }

  const clearValue = result.clearValues[handle];
  if (clearValue === undefined || clearValue === null) return 0n;
  return BigInt(clearValue as bigint);
}

async function depositForUser(userId: string, amount: bigint): Promise<string> {
  const { walletClient, publicClient, account } = getOwnerClients();
  const marketplaceAddress = SECRET_MARKETPLACE_ADDRESS as `0x${string}`;

  // FHE-encrypt the deposit amount
  const encrypted = await encryptUint64(
    marketplaceAddress,
    account.address,
    amount,
    RPC_URL,
  );

  console.log(`[place-bids] depositFor(${userId}, ${amount}) — submitting tx...`);
  const hash = await walletClient.writeContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "depositFor",
    args: [userId, toHexBytes(encrypted.handles[0]), toHexBytes(encrypted.inputProof)],
  });
  const receipt = await waitForReceipt(publicClient, hash);
  console.log(`[place-bids] depositFor confirmed: ${receipt.transactionHash}`);
  return receipt.transactionHash;
}

async function placeBidOnChain(
  auctionId: number,
  bidderId: string,
  previousBidderId: string,
  amount: bigint,
): Promise<string> {
  const { walletClient, publicClient, account } = getOwnerClients();
  const marketplaceAddress = SECRET_MARKETPLACE_ADDRESS as `0x${string}`;

  // FHE-encrypt the bid amount
  const encrypted = await encryptUint64(
    marketplaceAddress,
    account.address,
    amount,
    RPC_URL,
  );

  console.log(`[place-bids] placeBid(auction=${auctionId}, bidder=${bidderId}, amount=${amount}) — submitting tx...`);
  const hash = await walletClient.writeContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "placeBid",
    args: [
      BigInt(auctionId),
      bidderId,
      previousBidderId,
      toHexBytes(encrypted.handles[0]),
      toHexBytes(encrypted.inputProof),
      amount,
    ],
  });
  const receipt = await waitForReceipt(publicClient, hash);
  console.log(`[place-bids] placeBid confirmed: ${receipt.transactionHash}`);
  return receipt.transactionHash;
}

// ---------------------------------------------------------------------------
// Balance management
// ---------------------------------------------------------------------------

async function ensureBalance(account: TestAccount, userId: string): Promise<bigint> {
  // Check marketplace balance directly on-chain
  let balance: bigint;
  try {
    balance = await getOnChainBalance(userId);
    console.log(`  [place-bids] ${account.address.slice(0, 10)}... balance: ${balance}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  [place-bids] balance check failed for ${userId}: ${msg.slice(0, 100)}`);
    return 0n;
  }

  if (balance >= LOW_BALANCE_THRESHOLD) {
    return balance;
  }

  console.log(
    `  [place-bids] ${account.address.slice(0, 10)}... balance ${balance} < threshold, topping up`,
  );

  try {
    const { walletClient, publicClient } = getOwnerClients();

    // Step 1: Mint cUSDC to admin address
    const mintHash = await walletClient.writeContract({
      address: CONFIDENTIAL_USDC_ADDRESS as `0x${string}`,
      abi: fheConfidentialUsdcAbi,
      functionName: "mintPlaintext",
      args: [walletClient.account.address, TOPUP_AMOUNT],
    });
    await waitForReceipt(publicClient, mintHash);
    console.log(`  [place-bids] minted ${TOPUP_AMOUNT} cUSDC to admin (tx: ${mintHash.slice(0, 10)}...)`);

    // Step 2: Deposit into marketplace for the user
    await depositForUser(userId, TOPUP_AMOUNT);
    console.log(`  [place-bids] deposited ${TOPUP_AMOUNT} for ${account.address.slice(0, 10)}...`);

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
  console.log(`[place-bids] daemon (internal API): ${DAEMON_URL}`);
  console.log(`[place-bids] rpc: ${RPC_URL}`);
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
    const account = accounts[Math.floor(Math.random() * accounts.length)];

    try {
      // Register user to get pseudonymous ID
      const userId = await registerUser(account.address);

      // Self-bid check: reject if bidder is the seller
      if (userId === auction.sellerId) {
        console.log(
          `  [place-bids] Skipping auction ${auction.auctionId} — self-bid (${userId})`,
        );
        continue;
      }

      const balance = await ensureBalance(account, userId);
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

      // Read auction from contract to get previousBidderId
      let previousBidderId = "";
      try {
        const { publicClient } = getOwnerClients();
        const auctionData = await publicClient.readContract({
          address: SECRET_MARKETPLACE_ADDRESS as `0x${string}`,
          abi: fheSecretMarketplaceAbi,
          functionName: "getAuction",
          args: [BigInt(auction.auctionId)],
        });
        // auctionData is a readonly tuple: [sellerId, endTime, secretDataCid, currentBidderId, ...]
        previousBidderId = auctionData[3] || "";
      } catch {
        // Auction may not exist yet — proceed without previousBidderId
      }

      console.log(
        `  [place-bids] Bidding ${bidAmount} on auction ${auction.auctionId} from ${account.address.slice(0, 10)}...`,
      );

      const txHash = await placeBidOnChain(
        Number(auction.auctionId),
        userId,
        previousBidderId,
        bidAmount,
      );

      // Sync bid to daemon SQLite via internal API
      try {
        await internalPost("/internal/record-bid", {
          auctionId: Number(auction.auctionId),
          bidderId: userId,
          amount: bidAmount.toString(),
          txHash,
        });
      } catch (err) {
        // Non-fatal: bid is on-chain even if DB sync fails
        console.warn(`  [place-bids] record-bid sync failed:`, err instanceof Error ? err.message : err);
      }

      console.log(`  [place-bids] Bid placed: tx=${txHash.slice(0, 14)}...`);
      bidsPlaced++;
      const usdcAmount = (Number(bidAmount) / 1e6).toFixed(0);
      successDetails.push(
        `  ${account.address.slice(0, 6)}.. bid $${usdcAmount} on #${auction.auctionId}` +
        (auction.eventTitle ? ` — ${auction.eventTitle.slice(0, 50)}` : "") +
        `\n  ${FRONTEND_URL}/auction/${auction.auctionId}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // Check for self-bid or other contract rejections
      if (msg.includes("self-bid") || msg.includes("SELF_BID")) {
        console.log(
          `  [place-bids] Skipping auction ${auction.auctionId} — self-bid`,
        );
        continue;
      }

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

if (!OWNER_PK) {
  console.error("[place-bids] OWNER_PK is required — set it in scripts/.env");
  process.exit(1);
}

if (!INTERNAL_API_KEY) {
  console.error("[place-bids] INTERNAL_API_KEY is required — set it in scripts/.env");
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[place-bids] fatal:", err);
    ntfy("Place Bids FATAL", `${err}`, ["x"]).finally(() => process.exit(1));
  });
