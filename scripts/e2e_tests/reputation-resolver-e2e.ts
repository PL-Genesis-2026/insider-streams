/**
 * Reputation Resolver E2E Test Script
 *
 * Full lifecycle test on Eth Sepolia:
 *   1. Owner creates an ExamplePredictionMarket event (60s duration)
 *   2. Owner creates 2 auctions — SellerA predicts "yes", SellerB predicts "no"
 *   3. Owner places bids on both auctions
 *   4. Insert Supabase records (sellers, secrets with event_data, deposits, private_bids)
 *   5. Waits for auctions to expire -> CRE auction-closer closes them
 *   6. Waits for prediction market event to close + force settles it to "Yes"
 *   7. Runs CRE reputation-resolver (dry run first, then broadcast)
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
  confidentialUsdcAbi,
  secretMarketplaceAbi,
} from "@private-streams/common";
import type { Database } from "@private-streams/common";
import { parseEventLogs, formatUnits, type Address, type Hex } from "viem";
import {
  assert,
  banner,
  createClients,
  ensureUsdcBalance,
  envRequired,
  runCRE,
  step,
  waitForTimestamp,
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
const AUCTION_DURATION = 120; // 120 seconds — needs headroom for setup steps + remote latency
const EVENT_DURATION = BigInt(180); // 180 seconds — must outlast auctions
const DEPOSIT_AMOUNT = BID_AMOUNT * 10n; // 10 USDC headroom
const QUESTION = "Reputation resolver E2E test event";

const MIN_BALANCE = 10_000_000n; // 10 USDC
const MINT_AMOUNT = 10_000_000_000n; // 10,000 USDC
const APPROVAL_AMOUNT = 100_000_000_000n; // 100,000 USDC blanket
const MIN_ALLOWANCE = 10_000_000n; // 10 USDC — threshold to trigger approve
const USDC_DECIMALS = 6;

// Unique transaction ID for the mock deposit (avoids collisions with real data)
const DEPOSIT_TX_ID = `e2e-reputation-resolver-deposit-${Date.now()}`;

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  // Read the ExamplePredictionMarket address from SecretMarketplace
  const SIMPLE_MARKET = (await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "marketplace",
  })) as Address;

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
  const allowanceSM = await publicClient.readContract({
    address: CONFIDENTIAL_USDC,
    abi: confidentialUsdcAbi,
    functionName: "allowance",
    args: [ownerAccount.address, SECRET_MARKETPLACE],
  });
  if (allowanceSM < MIN_ALLOWANCE) {
    const h = await ownerClient.writeContract({
      address: CONFIDENTIAL_USDC,
      abi: confidentialUsdcAbi,
      functionName: "approve",
      args: [SECRET_MARKETPLACE, APPROVAL_AMOUNT],
    });
    await waitForTx(publicClient, h, "Owner approved SecretMarketplace");
  } else {
    console.log(`  ok SecretMarketplace allowance sufficient`);
  }

  const allowanceMarket = await publicClient.readContract({
    address: CONFIDENTIAL_USDC,
    abi: confidentialUsdcAbi,
    functionName: "allowance",
    args: [ownerAccount.address, SIMPLE_MARKET],
  });
  if (allowanceMarket < MIN_ALLOWANCE) {
    const h = await ownerClient.writeContract({
      address: CONFIDENTIAL_USDC,
      abi: confidentialUsdcAbi,
      functionName: "approve",
      args: [SIMPLE_MARKET, APPROVAL_AMOUNT],
    });
    await waitForTx(publicClient, h, "Owner approved ExamplePredictionMarket");
  } else {
    console.log(`  ok ExamplePredictionMarket allowance sufficient`);
  }

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
  const eventLogs = parseEventLogs({
    abi: examplePredictionMarketAbi,
    logs: eventReceipt.logs,
    eventName: "EventCreated",
  });
  const eventId = eventLogs[0].args.eventId;
  console.log(`  Event ID: ${eventId}`);

  // ── Step 5: Create auction A (SellerA predicts "yes") ──────────────────────
  step(`Creating auction A — ${SELLER_A} predicts "yes" (${AUCTION_DURATION}s duration)...`);
  const nowA = BigInt(Math.floor(Date.now() / 1000));
  const endTimeA = nowA + BigInt(AUCTION_DURATION);

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
  const auctionALogs = parseEventLogs({
    abi: secretMarketplaceAbi,
    logs: auctionAReceipt.logs,
    eventName: "AuctionCreated",
  });
  const auctionIdA = auctionALogs[0].args.auctionId;
  const auctionIdAStr = auctionIdA.toString();
  console.log(`  Auction A ID: ${auctionIdA}`);

  // ── Step 6: Create auction B (SellerB predicts "no") ───────────────────────
  step(`Creating auction B — ${SELLER_B} predicts "no" (${AUCTION_DURATION}s duration)...`);
  const nowB = BigInt(Math.floor(Date.now() / 1000));
  const endTimeB = nowB + BigInt(AUCTION_DURATION);

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
  const auctionBLogs = parseEventLogs({
    abi: secretMarketplaceAbi,
    logs: auctionBReceipt.logs,
    eventName: "AuctionCreated",
  });
  const auctionIdB = auctionBLogs[0].args.auctionId;
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

  // Upsert seller A
  const { error: sellerAErr } = await supabase
    .from("sellers")
    .upsert({ id: SELLER_A, address: ownerAccount.address.toLowerCase() }, { onConflict: "id" });
  assert(!sellerAErr, `Failed to upsert seller A: ${sellerAErr?.message}`);
  console.log(`  ok Seller A upserted: ${SELLER_A} -> ${ownerAccount.address}`);

  // Upsert seller B
  const { error: sellerBErr } = await supabase
    .from("sellers")
    .upsert({ id: SELLER_B, address: ownerAccount.address.toLowerCase() }, { onConflict: "id" });
  assert(!sellerBErr, `Failed to upsert seller B: ${sellerBErr?.message}`);
  console.log(`  ok Seller B upserted: ${SELLER_B} -> ${ownerAccount.address}`);

  // Insert secret for Auction A — predicts "yes"
  const { error: secretAErr } = await supabase
    .from("secrets")
    .upsert({
      auction_id: auctionIdAStr,
      secret_data: "E2E reputation test secret A",
      seller_id: SELLER_A,
      event_data: {
        marketplace: "ExamplePredictionMarket",
        event: QUESTION,
        marketId: Number(eventId),
        outcome: "yes",
      },
    }, { onConflict: "auction_id" });
  assert(!secretAErr, `Failed to insert secret A: ${secretAErr?.message}`);
  console.log(`  ok Secret A inserted for auction ${auctionIdAStr} (outcome: yes)`);

  // Insert secret for Auction B — predicts "no"
  const { error: secretBErr } = await supabase
    .from("secrets")
    .upsert({
      auction_id: auctionIdBStr,
      secret_data: "E2E reputation test secret B",
      seller_id: SELLER_B,
      event_data: {
        marketplace: "ExamplePredictionMarket",
        event: QUESTION,
        marketId: Number(eventId),
        outcome: "no",
      },
    }, { onConflict: "auction_id" });
  assert(!secretBErr, `Failed to insert secret B: ${secretBErr?.message}`);
  console.log(`  ok Secret B inserted for auction ${auctionIdBStr} (outcome: no)`);

  // Insert confirmed deposit transfer so bidder has available balance
  const { error: depositErr } = await supabase
    .from("transfers")
    .insert({
      transaction_id: DEPOSIT_TX_ID,
      user_address: bidderAccount!.address.toLowerCase(),
      amount: DEPOSIT_AMOUNT.toString(),
      status: "confirmed",
    });
  assert(!depositErr, `Failed to insert deposit transfer: ${depositErr?.message}`);
  console.log(`  ok Deposit: ${formatUnits(DEPOSIT_AMOUNT, USDC_DECIMALS)} USDC for bidder`);

  // Insert active private bid for Auction A
  const { error: bidAErr } = await supabase
    .from("private_bids")
    .insert({
      auction_id: auctionIdAStr,
      bidder_address: bidderAccount!.address.toLowerCase(),
      amount: BID_AMOUNT.toString(),
      status: "active",
    });
  assert(!bidAErr, `Failed to insert private_bid A: ${bidAErr?.message}`);
  console.log(`  ok Private bid A: ${formatUnits(BID_AMOUNT, USDC_DECIMALS)} USDC from bidder`);

  // Insert active private bid for Auction B
  const { error: bidBErr } = await supabase
    .from("private_bids")
    .insert({
      auction_id: auctionIdBStr,
      bidder_address: bidderAccount!.address.toLowerCase(),
      amount: BID_AMOUNT.toString(),
      status: "active",
    });
  assert(!bidBErr, `Failed to insert private_bid B: ${bidBErr?.message}`);
  console.log(`  ok Private bid B: ${formatUnits(BID_AMOUNT, USDC_DECIMALS)} USDC from bidder`);

  // ── Step 9: Wait for auctions to expire ────────────────────────────────────
  step("Waiting for auctions to expire...");
  const auctionDataA = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getAuction",
    args: [auctionIdA],
  });
  const auctionDataB = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getAuction",
    args: [auctionIdB],
  });
  // Wait for the later of the two end times
  const latestEndTime = auctionDataA.endTime > auctionDataB.endTime
    ? auctionDataA.endTime
    : auctionDataB.endTime;
  await waitForTimestamp(publicClient, latestEndTime, "Auction expiry");

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

  // ── Step 12: Wait for prediction market event to close ─────────────────────
  step("Waiting for prediction market event to close...");
  const eventData = await publicClient.readContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "getEvent",
    args: [eventId],
  });
  await waitForTimestamp(publicClient, eventData.eventClose, "Event close time");

  // ── Step 13: Force settle event to "Yes" outcome ───────────────────────────
  step('Force settling event to "Yes" outcome...');
  const forceSettleHash = await ownerClient.writeContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "forceSettle",
    args: [eventId, 2, 9500, "E2E test"],
  });
  await waitForTx(publicClient, forceSettleHash, "Event force-settled to Yes");

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

  // ── Step 15: Run CRE reputation-resolver (dry run first) ──────────────────
  step("Running CRE reputation-resolver dry run...");
  runCRE({ workflow: "reputation-resolver", triggerIndex: 0 });
  console.log(`  ok Dry run completed`);

  // ── Step 16: Run CRE reputation-resolver (broadcast) ──────────────────────
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
