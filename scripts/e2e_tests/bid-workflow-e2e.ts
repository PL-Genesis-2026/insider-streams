/**
 * Bid Submission E2E Test
 *
 * Tests the bid placement core logic directly — no frontend required.
 * Uses the same `executeBid` function that the Next.js API route calls.
 *
 * Flow:
 *   1.  Ensure USDC balances + approvals (on-chain public token)
 *   2.  Vault deposit for each bidder (funds private balances)
 *   3.  Private transfer from each bidder → platform EOA (the "deposit")
 *   4.  Run CRE user-balance-recording-fallback to record deposits in Supabase
 *   5.  Verify Supabase balances view
 *   6.  Create prediction event + auction on-chain
 *   7.  Bid 1 (1 USDC) from bidder 1 → assert active in Supabase
 *   8.  Bid 2 (2 USDC) from bidder 2 (outbid) → assert 1 active + 1 outbid
 *   9.  Bid 3 (5 USDC) from bidder 1 (outbid) → assert 1 active + 2 outbid
 *  10.  Error: ALREADY_HIGHEST
 *  11.  Error: BID_TOO_LOW
 *  12.  Cleanup
 *
 * Env vars required:
 *   OWNER_PK                    — platform EOA / admin wallet (calls placeBid on-chain)
 *   BIDDER_PK                   — second bidder identity
 *   RPC_URL                     — Eth Sepolia RPC
 *   SUPABASE_URL                — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — Supabase service role key
 *
 * Usage: pnpm e2e:bid-submission
 */

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import stringify from "fast-json-stable-stringify";
import {
  CONFIDENTIAL_USDC_ADDRESS,
  PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
  SECRET_MARKETPLACE_ADDRESS,
  VAULT_ADDRESS,
  CONFIDENTIAL_USDC_DECIMALS,
  confidentialUsdcAbi,
  secretMarketplaceAbi,
  executeBid,
  verifySignedRequest,
} from "@private-streams/common";
import type { Database } from "@private-streams/common";
import { parseEventLogs, formatUnits, type Address, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import {
  banner,
  step,
  assert,
  envRequired,
  createClients,
  waitForTx,
  ensureUsdcBalance,
  ensureUsdcApproval,
  parseFirstEventLog,
  readSimpleMarketAddress,
  runCRE,
  poll,
  resetStepCounter,
  MIN_BALANCE,
  MINT_AMOUNT,
} from "./e2e-helpers.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const OWNER_PK = envRequired("OWNER_PK") as Hex;
const BIDDER_PK = envRequired("BIDDER_PK") as Hex;
const RPC_URL = envRequired("RPC_URL");
const SUPABASE_URL = envRequired("SUPABASE_URL");
const SUPABASE_KEY = envRequired("SUPABASE_SERVICE_ROLE_KEY");

const CONFIDENTIAL_USDC = CONFIDENTIAL_USDC_ADDRESS as Address;
const PRIVATE_USDC = PRIVATE_CONFIDENTIAL_USDC_ADDRESS as Address;
const VAULT = VAULT_ADDRESS as Address;
const SECRET_MARKETPLACE = SECRET_MARKETPLACE_ADDRESS as Address;
const PRIVATE_TOKEN_API = "https://convergence2026-token-api.cldev.cloud";

const { publicClient, ownerClient, ownerAccount, bidderClient, bidderAccount } =
  createClients({ ownerPk: OWNER_PK, bidderPk: BIDDER_PK, rpcUrl: RPC_URL });

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);

// ─── Constants ───────────────────────────────────────────────────────────────

const BID_1 = 1_000_000n; // 1 USDC
const BID_2 = 2_000_000n; // 2 USDC
const BID_3 = 5_000_000n; // 5 USDC
const VAULT_DEPOSIT_AMOUNT = 20_000_000n; // 20 USDC — enough for all bids with headroom
const DEPOSIT_AMOUNT = 10_000_000n;       // 10 USDC private-transferred to platform EOA
const AUCTION_DURATION = 120;             // seconds (we don't wait for it to close)
const EVENT_DURATION = BigInt(300);       // seconds

const SELLER_NAME = "BidSubmissionE2ESeller";

// ─── Bid helper: sign → verify → execute (mirrors full API route flow) ───────

/**
 * Signs a bid request as the given signer, runs it through verifySignedRequest
 * (same function the API route uses), then calls executeBid with the verified
 * address. Tests the complete client→server signing roundtrip without HTTP.
 */
async function signAndBid(
  signer: PrivateKeyAccount,
  bidDeps: Parameters<typeof executeBid>[0],
  opts: { auctionId: string; amount: bigint },
) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = {
    auctionId: opts.auctionId,
    amount: opts.amount.toString(),
    timestamp,
  };
  const message = stringify(payload);
  const signature = await signer.signMessage({ message });

  const verified = await verifySignedRequest({ ...payload, signature });
  assert(verified.ok, `Signature verification failed: ${!verified.ok && verified.error}`);

  return executeBid(bidDeps, {
    bidderAddr: verified.payload.userAddress,
    auctionId: opts.auctionId,
    amount: opts.amount.toString(),
  });
}

// EIP-712 domain for Private Token API signing
const EIP712_DOMAIN = {
  name: "CompliantPrivateTokenDemo",
  version: "0.0.1",
  chainId: 11155111,
  verifyingContract: VAULT as `0x${string}`,
} as const;

const vaultAbi = [
  {
    name: "deposit",
    type: "function" as const,
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ─── Private Token helpers ───────────────────────────────────────────────────

async function vaultDeposit(
  walletClient: ReturnType<typeof createClients>["ownerClient"],
  amount: bigint,
): Promise<Hex> {
  const approveHash = await walletClient.writeContract({
    address: PRIVATE_USDC,
    abi: confidentialUsdcAbi,
    functionName: "approve",
    args: [VAULT, amount],
  });
  await waitForTx(publicClient, approveHash, "Approve vault");

  const depositHash = await walletClient.writeContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "deposit",
    args: [PRIVATE_USDC, amount],
  });
  await waitForTx(
    publicClient,
    depositHash,
    `Vault deposit (${formatUnits(amount, CONFIDENTIAL_USDC_DECIMALS)} USDC)`,
  );
  return depositHash;
}

async function pollVaultDeposit(signer: PrivateKeyAccount, txHash: Hex): Promise<void> {
  await poll(
    async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const sig = await signer.signTypedData({
        domain: EIP712_DOMAIN,
        types: {
          "List Transactions": [
            { name: "account", type: "address" },
            { name: "timestamp", type: "uint256" },
            { name: "cursor", type: "string" },
            { name: "limit", type: "uint256" },
          ],
        },
        primaryType: "List Transactions",
        message: { account: signer.address, timestamp: BigInt(timestamp), cursor: "", limit: 100n },
      });
      const resp = await fetch(`${PRIVATE_TOKEN_API}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: signer.address, timestamp, auth: sig, limit: 100 }),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as { transactions?: { type: string; tx_hash?: string }[] };
      return (data.transactions ?? []).find(
        (t) => t.type === "deposit" && t.tx_hash?.toLowerCase() === txHash.toLowerCase(),
      ) ?? null;
    },
    `vault deposit ${txHash.slice(0, 10)}... in API`,
    { maxAttempts: 20, intervalMs: 3_000, backoff: true },
  );
}

async function privateTransfer(
  signer: PrivateKeyAccount,
  recipient: Address,
  amount: bigint,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = await signer.signTypedData({
    domain: EIP712_DOMAIN,
    types: {
      "Private Token Transfer": [
        { name: "sender", type: "address" },
        { name: "recipient", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "flags", type: "string[]" },
        { name: "timestamp", type: "uint256" },
      ],
    },
    primaryType: "Private Token Transfer",
    message: {
      sender: signer.address,
      recipient,
      token: PRIVATE_USDC,
      amount,
      flags: [],
      timestamp: BigInt(timestamp),
    },
  });
  const resp = await fetch(`${PRIVATE_TOKEN_API}/private-transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account: signer.address,
      recipient,
      token: PRIVATE_USDC,
      amount: amount.toString(),
      flags: [],
      timestamp,
      auth: sig,
    }),
  });
  if (!resp.ok) throw new Error(`POST /private-transfer failed (${resp.status}): ${await resp.text()}`);
  const data = (await resp.json()) as { transaction_id: string };
  console.log(
    `  Private transfer: ${signer.address.slice(0, 10)}→${recipient.slice(0, 10)} ${formatUnits(amount, CONFIDENTIAL_USDC_DECIMALS)} USDC tx_id=${data.transaction_id}`,
  );
  return data.transaction_id;
}

async function pollIncomingTransfer(
  platformAccount: PrivateKeyAccount,
  txId: string,
): Promise<void> {
  await poll(
    async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const sig = await platformAccount.signTypedData({
        domain: EIP712_DOMAIN,
        types: {
          "List Transactions": [
            { name: "account", type: "address" },
            { name: "timestamp", type: "uint256" },
            { name: "cursor", type: "string" },
            { name: "limit", type: "uint256" },
          ],
        },
        primaryType: "List Transactions",
        message: { account: platformAccount.address, timestamp: BigInt(timestamp), cursor: "", limit: 100n },
      });
      const resp = await fetch(`${PRIVATE_TOKEN_API}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: platformAccount.address, timestamp, auth: sig, limit: 100 }),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        transactions?: { id: string; type: string; is_incoming?: boolean }[];
      };
      return (data.transactions ?? []).find(
        (t) => t.type === "transfer" && t.is_incoming === true && t.id === txId,
      ) ?? null;
    },
    `incoming transfer ${txId} in API`,
    { maxAttempts: 20, intervalMs: 3_000, backoff: true },
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  resetStepCounter();

  const SIMPLE_MARKET = await readSimpleMarketAddress(publicClient, SECRET_MARKETPLACE);

  banner("Bid Submission E2E Test");
  console.log(`  Bidder 1 (owner/admin): ${ownerAccount.address}`);
  console.log(`  Bidder 2:               ${bidderAccount!.address}`);
  console.log(`  ConfidentialUSDC:       ${CONFIDENTIAL_USDC}`);
  console.log(`  PrivateUSDC:            ${PRIVATE_USDC}`);
  console.log(`  SimpleMarket:           ${SIMPLE_MARKET}`);
  console.log(`  SecretMarketplace:      ${SECRET_MARKETPLACE}`);
  console.log(`  Supabase:               ${SUPABASE_URL}`);

  const ownerAddr = ownerAccount.address.toLowerCase();
  const bidderAddr = bidderAccount!.address.toLowerCase();
  let auctionId = 0n;

  try {
    // ── Step 1: Ensure on-chain USDC balances + approvals ──────────────────────
    step("Ensuring on-chain USDC balances + approvals...");
    await ensureUsdcBalance(publicClient, ownerClient, CONFIDENTIAL_USDC, ownerAccount.address, MIN_BALANCE, MINT_AMOUNT);
    await ensureUsdcBalance(publicClient, ownerClient, PRIVATE_USDC, ownerAccount.address, VAULT_DEPOSIT_AMOUNT, VAULT_DEPOSIT_AMOUNT);
    await ensureUsdcBalance(publicClient, ownerClient, PRIVATE_USDC, bidderAccount!.address, VAULT_DEPOSIT_AMOUNT, VAULT_DEPOSIT_AMOUNT);
    await ensureUsdcApproval(publicClient, ownerClient, CONFIDENTIAL_USDC, ownerAccount.address, SECRET_MARKETPLACE, "SecretMarketplace");
    await ensureUsdcApproval(publicClient, ownerClient, CONFIDENTIAL_USDC, ownerAccount.address, SIMPLE_MARKET, "ExamplePredictionMarket");

    // ── Step 2: Vault deposits (fund private balances) ─────────────────────────
    step("Vault deposits to fund private balances...");
    const ownerVaultHash = await vaultDeposit(ownerClient, VAULT_DEPOSIT_AMOUNT);
    await pollVaultDeposit(ownerAccount, ownerVaultHash);
    console.log(`  ok Bidder 1 vault deposit confirmed in API`);

    const bidderVaultHash = await vaultDeposit(bidderClient!, VAULT_DEPOSIT_AMOUNT);
    await pollVaultDeposit(bidderAccount!, bidderVaultHash);
    console.log(`  ok Bidder 2 vault deposit confirmed in API`);

    // ── Step 3: Private transfers → platform EOA (deposits) ───────────────────
    step("Private transfers to platform EOA (deposits)...");
    // Owner deposits to itself (platform EOA = owner address)
    const ownerDepositTxId = await privateTransfer(ownerAccount, ownerAccount.address as Address, DEPOSIT_AMOUNT);
    await pollIncomingTransfer(ownerAccount, ownerDepositTxId);
    console.log(`  ok Bidder 1 deposit visible in API`);

    // Bidder deposits to owner (platform EOA)
    const bidderDepositTxId = await privateTransfer(bidderAccount!, ownerAccount.address as Address, DEPOSIT_AMOUNT);
    await pollIncomingTransfer(ownerAccount, bidderDepositTxId);
    console.log(`  ok Bidder 2 deposit visible in API`);

    // ── Step 4: CRE reconciler → record deposits in Supabase ──────────────────
    step("Running CRE user-balance-recording-fallback...");
    runCRE({ workflow: "user-balance-recording-fallback", triggerIndex: 0 });
    console.log(`  ok Deposits recorded in Supabase`);

    // ── Step 5: Verify Supabase balances view ──────────────────────────────────
    step("Verifying Supabase balances...");
    const { data: ownerBal } = await supabase.from("balances").select("*").eq("user_address", ownerAddr).single();
    assert(!!ownerBal, "Bidder 1 not found in balances view");
    assert(BigInt(ownerBal!.available_balance!) >= BID_3, `Bidder 1 available_balance insufficient: ${ownerBal!.available_balance}`);
    console.log(`  ok Bidder 1 available: ${formatUnits(BigInt(ownerBal!.available_balance!), CONFIDENTIAL_USDC_DECIMALS)} USDC`);

    const { data: bidderBal } = await supabase.from("balances").select("*").eq("user_address", bidderAddr).single();
    assert(!!bidderBal, "Bidder 2 not found in balances view");
    assert(BigInt(bidderBal!.available_balance!) >= BID_3, `Bidder 2 available_balance insufficient: ${bidderBal!.available_balance}`);
    console.log(`  ok Bidder 2 available: ${formatUnits(BigInt(bidderBal!.available_balance!), CONFIDENTIAL_USDC_DECIMALS)} USDC`);

    // ── Step 6: Create prediction event + auction ──────────────────────────────
    step("Creating prediction event...");
    const { examplePredictionMarketAbi } = await import("@private-streams/common");
    const createEventHash = await ownerClient.writeContract({
      address: SIMPLE_MARKET,
      abi: examplePredictionMarketAbi,
      functionName: "newEvent",
      args: ["Bid submission E2E test", EVENT_DURATION],
    });
    const eventReceipt = await waitForTx(publicClient, createEventHash, "Event created");
    const eventArgs = parseFirstEventLog(eventReceipt, examplePredictionMarketAbi, "EventCreated");
    const eventId = eventArgs.eventId as bigint;
    console.log(`  Event ID: ${eventId}`);

    step("Creating auction...");
    const endTime = BigInt(Math.floor(Date.now() / 1000)) + BigInt(AUCTION_DURATION);
    const createAuctionHash = await ownerClient.writeContract({
      address: SECRET_MARKETPLACE,
      abi: secretMarketplaceAbi,
      functionName: "createAuction",
      args: [SELLER_NAME, eventId, "Bid submission E2E test", endTime],
    });
    const auctionReceipt = await waitForTx(publicClient, createAuctionHash, "Auction created");
    const auctionLogs = parseEventLogs({
      abi: secretMarketplaceAbi,
      logs: auctionReceipt.logs,
      eventName: "AuctionCreated",
    });
    auctionId = auctionLogs[0].args.auctionId;
    const auctionIdStr = auctionId.toString();
    console.log(`  Auction ID: ${auctionId}`);

    // Pre-clean stale bids from prior failed runs
    await supabase.from("private_bids").delete().eq("auction_id", auctionIdStr);

    // Shared executeBid deps (admin wallet submits on-chain tx for all bids)
    const bidDeps = {
      supabase,
      publicClient,
      walletClient: ownerClient,
      marketplaceAddress: SECRET_MARKETPLACE,
    };

    // ── Step 7: Bid 1 — bidder 1 bids 1 USDC ─────────────────────────────────
    step("Bid 1 (1 USDC) from bidder 1...");
    const bid1 = await signAndBid(ownerAccount, bidDeps, { auctionId: auctionIdStr, amount: BID_1 });
    assert(bid1.ok, `Bid 1 failed: ${!bid1.ok && bid1.error}`);
    console.log(`  ok bidId=${bid1.ok && bid1.bidId} txHash=${bid1.ok && bid1.txHash?.slice(0, 10)}...`);

    const { data: bids7 } = await supabase.from("private_bids").select("*").eq("auction_id", auctionIdStr);
    assert(bids7!.length === 1, `Expected 1 bid, got ${bids7!.length}`);
    assert(bids7![0].status === "active", `Expected status=active, got ${bids7![0].status}`);
    assert(bids7![0].bidder_address === ownerAddr, `Wrong bidder address`);
    assert(bids7![0].amount === BID_1.toString(), `Wrong amount`);
    console.log(`  ok Supabase: 1 active bid (${formatUnits(BID_1, CONFIDENTIAL_USDC_DECIMALS)} USDC, bidder 1)`);

    // ── Step 8: Bid 2 — bidder 2 outbids at 2 USDC ───────────────────────────
    step("Bid 2 (2 USDC) from bidder 2 — outbid...");
    const bid2 = await signAndBid(bidderAccount!, bidDeps, { auctionId: auctionIdStr, amount: BID_2 });
    assert(bid2.ok, `Bid 2 failed: ${!bid2.ok && bid2.error}`);
    console.log(`  ok bidId=${bid2.ok && bid2.bidId}`);

    const { data: bids8 } = await supabase.from("private_bids").select("*").eq("auction_id", auctionIdStr).order("created_at", { ascending: true });
    assert(bids8!.length === 2, `Expected 2 bids, got ${bids8!.length}`);
    assert(bids8!.filter(b => b.status === "active").length === 1, "Expected 1 active");
    assert(bids8!.filter(b => b.status === "outbid").length === 1, "Expected 1 outbid");
    const outbid8 = bids8!.find(b => b.status === "outbid")!;
    assert(outbid8.bidder_address === ownerAddr, "Outbid row should be bidder 1");
    assert(!!outbid8.outbid_at, "outbid_at should be set");
    console.log(`  ok Supabase: 2 rows — 1 active (bidder 2), 1 outbid (bidder 1)`);

    // ── Step 9: Bid 3 — bidder 1 outbids at 5 USDC ───────────────────────────
    step("Bid 3 (5 USDC) from bidder 1 — outbid...");
    const bid3 = await signAndBid(ownerAccount, bidDeps, { auctionId: auctionIdStr, amount: BID_3 });
    assert(bid3.ok, `Bid 3 failed: ${!bid3.ok && bid3.error}`);
    console.log(`  ok bidId=${bid3.ok && bid3.bidId}`);

    const { data: bids9 } = await supabase.from("private_bids").select("*").eq("auction_id", auctionIdStr);
    assert(bids9!.length === 3, `Expected 3 bids, got ${bids9!.length}`);
    assert(bids9!.filter(b => b.status === "active").length === 1, "Expected 1 active");
    assert(bids9!.filter(b => b.status === "outbid").length === 2, "Expected 2 outbid");
    const active9 = bids9!.find(b => b.status === "active")!;
    assert(active9.bidder_address === ownerAddr, "Active bid should be bidder 1");
    assert(active9.amount === BID_3.toString(), `Expected amount=${BID_3}`);
    console.log(`  ok Supabase: 3 rows — 1 active (bidder 1, ${formatUnits(BID_3, CONFIDENTIAL_USDC_DECIMALS)} USDC), 2 outbid`);

    // ── Step 10: Error — already highest bidder ────────────────────────────────
    step("Error case: already highest bidder...");
    const bid4 = await signAndBid(ownerAccount, bidDeps, { auctionId: auctionIdStr, amount: BID_3 + 1n });
    assert(!bid4.ok, "Expected rejection — already highest bidder");
    assert(!bid4.ok && bid4.code === "ALREADY_HIGHEST", `Expected ALREADY_HIGHEST, got ${!bid4.ok && bid4.code}`);
    console.log(`  ok Rejected with ALREADY_HIGHEST`);

    // ── Step 11: Error — bid too low ───────────────────────────────────────────
    step("Error case: bid too low...");
    const bid5 = await signAndBid(bidderAccount!, bidDeps, { auctionId: auctionIdStr, amount: BID_2 });
    assert(!bid5.ok, "Expected rejection — bid too low");
    assert(!bid5.ok && bid5.code === "BID_TOO_LOW", `Expected BID_TOO_LOW, got ${!bid5.ok && bid5.code}`);
    console.log(`  ok Rejected with BID_TOO_LOW`);

    // ── Step 12: Cleanup ───────────────────────────────────────────────────────
    step("Cleanup...");
    await cleanup(auctionId);

    banner("PASS — Bid Submission E2E");
    console.log(`  Auction ID:  ${auctionId}`);
    console.log(`  Event ID:    ${eventId}`);
    console.log(`  Bid 1:       ${formatUnits(BID_1, CONFIDENTIAL_USDC_DECIMALS)} USDC (bidder 1 → outbid)`);
    console.log(`  Bid 2:       ${formatUnits(BID_2, CONFIDENTIAL_USDC_DECIMALS)} USDC (bidder 2 → outbid)`);
    console.log(`  Bid 3:       ${formatUnits(BID_3, CONFIDENTIAL_USDC_DECIMALS)} USDC (bidder 1 → active)`);
    console.log(`  Errors:      ALREADY_HIGHEST + BID_TOO_LOW both rejected correctly`);
  } catch (err) {
    await cleanup(auctionId);
    throw err;
  }
}

async function cleanup(auctionId: bigint) {
  if (auctionId === 0n) return;
  const { error } = await supabase.from("private_bids").delete().eq("auction_id", auctionId.toString());
  if (error) {
    console.log(`  WARN Failed to cleanup private_bids: ${error.message}`);
  } else {
    console.log(`  ok Deleted test rows from private_bids`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nx E2E test failed:", err);
    process.exit(1);
  });
