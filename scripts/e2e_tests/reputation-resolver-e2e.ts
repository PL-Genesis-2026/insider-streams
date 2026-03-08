/**
 * Reputation Resolver E2E Test Script
 *
 * Full lifecycle test on Eth Sepolia:
 *   1. Owner creates an ExamplePredictionMarket event
 *   2. Owner creates 2 auctions — SellerA predicts "yes", SellerB predicts "no"
 *   3. Owner places bids on both auctions
 *   4. Insert Supabase records (sellers, secrets with event_data, deposits, private_bids)
 *   5. Admin-expires both auctions immediately -> CRE auction-closer closes them
 *   6. Admin-closes prediction market event + requests settlement + CRE settler settles to "Yes"
 *   7. Runs CRE reputation-resolver (broadcast)
 *   8. Verifies: SellerA reputation +1, SellerB reputation -1, event marked resolved
 *
 * NOTE: No dry run before broadcast for auction-closer — CRE simulation makes
 * real HTTP calls even without --broadcast, which would settle the bid before
 * the on-chain close happens. We go straight to broadcast for auction-closer.
 *
 * Env vars required:
 *   OWNER_PK                  — deploys, creates events, closes auctions, settles
 *   BIDDER_PK                 — different from owner (used as bidder address in Supabase)
 *   RPC_URL                   — Eth Sepolia RPC
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key
 *
 * Usage: pnpm e2e:reputation-resolver
 */

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import {
  CONFIDENTIAL_USDC_ADDRESS,
  SECRET_MARKETPLACE_ADDRESS,
  examplePredictionMarketAbi,
  secretMarketplaceAbi,
} from "@private-streams/common";
import type { Database } from "@private-streams/common";
import type { Hex } from "viem";
import {
  MIN_BALANCE,
  MINT_AMOUNT,
  assert,
  banner,
  createClients,
  ensureUsdcApproval,
  ensureUsdcBalance,
  envRequired,
  parseFirstEventLog,
  readSimpleMarketAddress,
  runCRE,
  setupSupabaseAuctionBid,
  step,
  waitForTx,
} from "./e2e-helpers.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const OWNER_PK = envRequired("OWNER_PK") as Hex;
const BIDDER_PK = envRequired("BIDDER_PK") as Hex;
const RPC_URL = envRequired("RPC_URL");
const SUPABASE_URL = envRequired("SUPABASE_URL");
const SUPABASE_KEY = envRequired("SUPABASE_SERVICE_ROLE_KEY");

const CONFIDENTIAL_USDC = CONFIDENTIAL_USDC_ADDRESS;
const SECRET_MARKETPLACE = SECRET_MARKETPLACE_ADDRESS;

const { publicClient, ownerClient, ownerAccount, bidderAccount } =
  createClients({ ownerPk: OWNER_PK, bidderPk: BIDDER_PK, rpcUrl: RPC_URL });

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);

// ─── Constants ───────────────────────────────────────────────────────────────

const SELLER_A = "E2EReputationSellerA";
const SELLER_B = "E2EReputationSellerB";
const BID_AMOUNT = 1_000_000n; // 1 USDC
const EVENT_DURATION = BigInt(3600); // 1 hour — well beyond test duration
const DEPOSIT_AMOUNT = BID_AMOUNT * 10n; // 10 USDC headroom
const QUESTION = "The New York Yankees won the 2009 World Series."; // factual "Yes" for Gemini

// Unique transaction ID for the mock deposit (avoids collisions with real data)
const DEPOSIT_TX_ID = `e2e-reputation-resolver-deposit-${Date.now()}`;

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  // Read the ExamplePredictionMarket address from SecretMarketplace
  const SIMPLE_MARKET = await readSimpleMarketAddress(publicClient, SECRET_MARKETPLACE);

  banner("Reputation Resolver E2E Test");
  console.log(`  Owner (seller):    ${ownerAccount.address}`);
  console.log(`  Bidder (buyer):    ${bidderAccount!.address}`);
  console.log(`  ConfidentialUSDC:  ${CONFIDENTIAL_USDC}`);
  console.log(`  SimpleMarket:      ${SIMPLE_MARKET}`);
  console.log(`  SecretMarketplace: ${SECRET_MARKETPLACE}`);
  console.log(`  Supabase:          ${SUPABASE_URL}`);

  // ── Step 1: Ensure USDC balances ────────────────────────────────────────────
  step("Ensuring owner has USDC...");
  await ensureUsdcBalance(
    publicClient,
    ownerClient,
    CONFIDENTIAL_USDC,
    ownerAccount.address,
    MIN_BALANCE,
    MINT_AMOUNT,
  );

  // ── Step 2: Approve USDC (only if needed) ──────────────────────────────────
  step("Ensuring USDC approvals...");
  await ensureUsdcApproval(
    publicClient,
    ownerClient,
    CONFIDENTIAL_USDC,
    ownerAccount.address,
    SECRET_MARKETPLACE,
    "SecretMarketplace",
  );
  await ensureUsdcApproval(
    publicClient,
    ownerClient,
    CONFIDENTIAL_USDC,
    ownerAccount.address,
    SIMPLE_MARKET,
    "ExamplePredictionMarket",
  );

  // ── Step 3: Register sellers on-chain ──────────────────────────────────────
  step("Registering sellers on-chain...");
  for (const sellerName of [SELLER_A, SELLER_B]) {
    const seller = await publicClient.readContract({
      address: SECRET_MARKETPLACE,
      abi: secretMarketplaceAbi,
      functionName: "getSeller",
      args: [sellerName],
    });
    if (seller.registered) {
      console.log(`  ok Seller "${sellerName}" already registered (reputation: ${seller.reputationScore})`);
    } else {
      const h = await ownerClient.writeContract({
        address: SECRET_MARKETPLACE,
        abi: secretMarketplaceAbi,
        functionName: "registerSeller",
        args: [sellerName],
      });
      await waitForTx(publicClient, h, `Registered seller "${sellerName}"`);
    }
  }

  // ── Step 4: Create prediction market event ─────────────────────────────────
  step("Owner creating ExamplePredictionMarket event (60s duration)...");
  const createEventHash = await ownerClient.writeContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "newEvent",
    args: [QUESTION, EVENT_DURATION],
  });
  const eventReceipt = await waitForTx(
    publicClient,
    createEventHash,
    "Event created",
  );
  const eventArgs = parseFirstEventLog(eventReceipt, examplePredictionMarketAbi, "EventCreated");
  const eventId = eventArgs.eventId as bigint;
  console.log(`  Event ID: ${eventId}`);

  // ── Step 5: Create auction A (SellerA predicts "yes") ──────────────────────
  step(`Creating auction A — ${SELLER_A} predicts "yes"...`);
  const latestBlockA = await publicClient.getBlock({ blockTag: "latest" });
  const endTimeA = latestBlockA.timestamp + BigInt(3600); // 1 hour — will be admin-expired immediately

  const createAuctionAHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "createAuction",
    args: [SELLER_A, eventId, QUESTION, endTimeA],
  });
  const auctionAReceipt = await waitForTx(
    publicClient,
    createAuctionAHash,
    "Auction A created",
  );
  const auctionAArgs = parseFirstEventLog(auctionAReceipt, secretMarketplaceAbi, "AuctionCreated");
  const auctionIdA = auctionAArgs.auctionId as bigint;
  const auctionIdAStr = auctionIdA.toString();
  console.log(`  Auction A ID: ${auctionIdA}`);

  // ── Step 6: Create auction B (SellerB predicts "no") ───────────────────────
  step(`Creating auction B — ${SELLER_B} predicts "no"...`);
  const latestBlockB = await publicClient.getBlock({ blockTag: "latest" });
  const endTimeB = latestBlockB.timestamp + BigInt(3600); // 1 hour — will be admin-expired immediately

  const createAuctionBHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "createAuction",
    args: [SELLER_B, eventId, QUESTION, endTimeB],
  });
  const auctionBReceipt = await waitForTx(
    publicClient,
    createAuctionBHash,
    "Auction B created",
  );
  const auctionBArgs = parseFirstEventLog(auctionBReceipt, secretMarketplaceAbi, "AuctionCreated");
  const auctionIdB = auctionBArgs.auctionId as bigint;
  const auctionIdBStr = auctionIdB.toString();
  console.log(`  Auction B ID: ${auctionIdB}`);

  // Verify both in open auctions
  const openBefore = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getOpenAuctions",
  });
  console.log(`  Open auctions: [${openBefore.join(", ")}]`);
  assert(
    openBefore.includes(auctionIdA),
    `Auction A (${auctionIdA}) not in open auctions`,
  );
  assert(
    openBefore.includes(auctionIdB),
    `Auction B (${auctionIdB}) not in open auctions`,
  );

  // ── Step 7: Place bids on both auctions ────────────────────────────────────
  step("Owner placing on-chain bids on both auctions...");
  const bidAHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "placeBid",
    args: [auctionIdA, BID_AMOUNT],
  });
  await waitForTx(publicClient, bidAHash, "Bid placed on Auction A");

  const bidBHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "placeBid",
    args: [auctionIdB, BID_AMOUNT],
  });
  await waitForTx(publicClient, bidBHash, "Bid placed on Auction B");

  // ── Step 8: Insert Supabase records ────────────────────────────────────────
  step("Setting up Supabase records (sellers, secrets, deposit, private_bids)...");

  // Seller A + deposit + bid A
  await setupSupabaseAuctionBid(supabase, {
    sellerName: SELLER_A,
    sellerAddress: ownerAccount.address,
    auctionId: auctionIdAStr,
    secretData: "E2E reputation test secret A",
    eventData: {
      marketplace: "ExamplePredictionMarket",
      event: QUESTION,
      marketId: Number(eventId),
      outcome: "yes",
    },
    bidderAddress: bidderAccount!.address,
    bidAmount: BID_AMOUNT,
    depositTxId: DEPOSIT_TX_ID,
    depositAmount: DEPOSIT_AMOUNT,
  });

  // Seller B + bid B only (skip deposit — bidder already has one from first call)
  await setupSupabaseAuctionBid(supabase, {
    sellerName: SELLER_B,
    sellerAddress: ownerAccount.address,
    auctionId: auctionIdBStr,
    secretData: "E2E reputation test secret B",
    eventData: {
      marketplace: "ExamplePredictionMarket",
      event: QUESTION,
      marketId: Number(eventId),
      outcome: "no",
    },
    bidderAddress: bidderAccount!.address,
    bidAmount: BID_AMOUNT,
    depositTxId: DEPOSIT_TX_ID, // not used since skipDeposit is true
    depositAmount: DEPOSIT_AMOUNT,
    skipDeposit: true,
  });

  // ── Step 9: Admin-expire both auctions immediately ─────────────────────────
  step("Admin expiring both auctions immediately...");
  const expireAHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "adminExpireAuction",
    args: [auctionIdA],
  });
  await waitForTx(publicClient, expireAHash, "Auction A admin-expired");

  const expireBHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "adminExpireAuction",
    args: [auctionIdB],
  });
  await waitForTx(publicClient, expireBHash, "Auction B admin-expired");

  // ── Step 10: Run CRE auction-closer (broadcast) ────────────────────────────
  // NOTE: Skip dry run — CRE simulation makes real HTTP calls even without
  // --broadcast, which would settle the bid before the on-chain close happens.
  step("Running CRE auction-closer with broadcast...");
  runCRE({ workflow: "secret-marketplace-auction-closer", triggerIndex: 0, broadcast: true });
  console.log(`  ok Broadcast completed`);

  // ── Step 11: Verify both auctions are closed on-chain ──────────────────────
  step("Verifying both auctions are closed on-chain...");
  const finalAuctionA = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getAuction",
    args: [auctionIdA],
  });
  assert(
    finalAuctionA.status === 1,
    `Auction A: expected status=1 (Closed), got status=${finalAuctionA.status}`,
  );
  console.log(`  ok Auction A (${auctionIdA}) is Closed (status=1)`);

  const finalAuctionB = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getAuction",
    args: [auctionIdB],
  });
  assert(
    finalAuctionB.status === 1,
    `Auction B: expected status=1 (Closed), got status=${finalAuctionB.status}`,
  );
  console.log(`  ok Auction B (${auctionIdB}) is Closed (status=1)`);

  // ── Step 12: Admin-close event + request settlement + CRE settler ──────────
  step("Admin-closing prediction market event...");
  const adminCloseHash = await ownerClient.writeContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "adminCloseEvent",
    args: [eventId],
  });
  await waitForTx(publicClient, adminCloseHash, "Event admin-closed");

  step("Requesting settlement...");
  const settlementRequestHash = await ownerClient.writeContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "requestSettlement",
    args: [eventId],
  });
  await waitForTx(publicClient, settlementRequestHash, "Settlement requested");

  step("Running CRE external-prediction-market-settler with broadcast...");
  runCRE({
    workflow: "external-prediction-market-settler",
    evmTxHash: settlementRequestHash,
    evmEventIndex: 0,
    triggerIndex: 0,
    broadcast: true,
  });
  const settledEvent = await publicClient.readContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "getEvent",
    args: [eventId],
  });
  assert(settledEvent.status === 2, `Expected event status=2 (Settled), got ${settledEvent.status}`);
  console.log(`  ok Event ${eventId} settled — outcome: ${settledEvent.outcome === 2 ? "Yes" : settledEvent.outcome === 1 ? "No" : `Unknown(${settledEvent.outcome})`}`);

  // ── Step 14: Record reputation before ──────────────────────────────────────
  step("Recording seller reputations before reputation-resolver...");
  const sellerABefore = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getSeller",
    args: [SELLER_A],
  });
  const sellerBBefore = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getSeller",
    args: [SELLER_B],
  });
  const repABefore = sellerABefore.reputationScore;
  const repBBefore = sellerBBefore.reputationScore;
  console.log(`  ${SELLER_A} reputation: ${repABefore}`);
  console.log(`  ${SELLER_B} reputation: ${repBBefore}`);

  // ── Step 15: Run CRE reputation-resolver (broadcast) ──────────────────────
  // NOTE: Skip dry run — it asserts nothing meaningful and adds 10-30s overhead.
  // The broadcast step does the real work, and verification happens on-chain afterward.
  step("Running CRE reputation-resolver with broadcast...");
  runCRE({ workflow: "reputation-resolver", triggerIndex: 0, broadcast: true });
  console.log(`  ok Broadcast completed`);

  // ── Step 17: Verify reputation changes ─────────────────────────────────────
  step("Verifying seller reputation changes...");
  const sellerAAfter = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getSeller",
    args: [SELLER_A],
  });
  const sellerBAfter = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getSeller",
    args: [SELLER_B],
  });
  const repAAfter = sellerAAfter.reputationScore;
  const repBAfter = sellerBAfter.reputationScore;

  console.log(`  ${SELLER_A} reputation: ${repABefore} -> ${repAAfter}`);
  console.log(`  ${SELLER_B} reputation: ${repBBefore} -> ${repBAfter}`);

  assert(
    repAAfter === repABefore + 1n,
    `${SELLER_A}: expected reputation ${repABefore} + 1 = ${repABefore + 1n}, got ${repAAfter}`,
  );
  console.log(`  ok ${SELLER_A} reputation increased by +1`);

  assert(
    repBAfter === repBBefore - 1n,
    `${SELLER_B}: expected reputation ${repBBefore} - 1 = ${repBBefore - 1n}, got ${repBAfter}`,
  );
  console.log(`  ok ${SELLER_B} reputation decreased by -1`);

  // ── Step 18: Verify event marked as resolved on-chain ──────────────────────
  step("Verifying event marked as resolved on-chain...");
  const resolved = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "eventResolved",
    args: [eventId],
  });
  assert(resolved === true, `Expected eventResolved(${eventId}) = true, got ${resolved}`);
  console.log(`  ok Event ${eventId} is marked as resolved`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  banner("PASS -- Reputation Resolver E2E");
  console.log(`  Event ID:            ${eventId}`);
  console.log(`  Auction A ID:        ${auctionIdA} (${SELLER_A}, predicted "yes")`);
  console.log(`  Auction B ID:        ${auctionIdB} (${SELLER_B}, predicted "no")`);
  console.log(`  Event outcome:       Yes`);
  console.log(`  ${SELLER_A} rep:     ${repABefore} -> ${repAAfter} (+1)`);
  console.log(`  ${SELLER_B} rep:     ${repBBefore} -> ${repBAfter} (-1)`);
  console.log(`  Event resolved:      true`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nx E2E test failed:", err);
    process.exit(1);
  });
