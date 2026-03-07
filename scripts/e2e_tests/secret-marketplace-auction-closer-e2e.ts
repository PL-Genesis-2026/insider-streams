/**
 * Auction Closer E2E Test Script
 *
 * Full lifecycle test on Eth Sepolia:
 *   1. Owner creates an ExamplePredictionMarket event
 *   2. Owner creates a SecretMarketplace auction (short duration)
 *   3. Owner places on-chain bid
 *   4. Insert Supabase records (seller, secret, deposit transfer, private_bid)
 *   5. Waits for auction to expire
 *   6. CRE secret-marketplace-auction-closer broadcast — closes auction on-chain + settles bid
 *   7. Verifies auction is closed on-chain
 *   8. Verifies bid settled in Supabase (status=won, won_at set)
 *   9. Verifies balances view (buyer spend + seller earnings)
 *
 * NOTE: No dry run before broadcast — CRE simulation makes real HTTP calls
 * even without --broadcast, which would settle the bid before the on-chain
 * close happens. We go straight to broadcast.
 *
 * Env vars required:
 *   OWNER_PK                  — creates event + auction, acts as seller
 *   BIDDER_PK                 — places bid (must be different from owner)
 *   RPC_URL                   — Eth Sepolia RPC
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key
 *
 * Usage: pnpm e2e:secret-marketplace-auction-closer
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

const MIN_BALANCE = 10_000_000n; // 10 USDC
const MINT_AMOUNT = 10_000_000_000n; // 10,000 USDC
const APPROVAL_AMOUNT = 100_000_000_000n; // 100,000 USDC blanket
const MIN_ALLOWANCE = 10_000_000n; // 10 USDC — threshold to trigger approve
const BID_AMOUNT = 2_000_000n; // 2 USDC
const EVENT_DURATION = BigInt(60); // 60 seconds (market event duration)
const AUCTION_DURATION = 45; // 45 seconds — needs headroom for Sepolia tx confirmation
const SELLER_NAME = "E2ETestSeller";
const USDC_DECIMALS = 6;

// Unique transaction ID for the mock deposit (avoids collisions with real data)
const DEPOSIT_TX_ID = `e2e-auction-closer-deposit-${Date.now()}`;
const DEPOSIT_AMOUNT = BID_AMOUNT * 10n; // 20 USDC — headroom

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  // Read the ExamplePredictionMarket address from SecretMarketplace
  const SIMPLE_MARKET = (await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "marketplace",
  })) as Address;

  banner("Auction Closer E2E Test (with Supabase settlement)");
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

  // ── Step 3: Create event ───────────────────────────────────────────────────
  step("Owner creating ExamplePredictionMarket event...");
  const createEventHash = await ownerClient.writeContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "newEvent",
    args: ["Auction closer E2E test", EVENT_DURATION],
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

  // ── Step 4: Create auction ─────────────────────────────────────────────────
  step("Owner creating auction (45s duration)...");
  // Compute endTime from latest on-chain block, not local clock, to avoid
  // clock skew causing the auction to expire before the bid tx lands.
  // Use 45s (not 30s) to give enough headroom for Sepolia tx confirmation.
  const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
  const endTime = latestBlock.timestamp + BigInt(AUCTION_DURATION);

  const createAuctionHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "createAuction",
    args: [SELLER_NAME, eventId, "Auction closer E2E test", endTime],
  });
  const auctionReceipt = await waitForTx(
    publicClient,
    createAuctionHash,
    "Auction created",
  );
  const auctionLogs = parseEventLogs({
    abi: secretMarketplaceAbi,
    logs: auctionReceipt.logs,
    eventName: "AuctionCreated",
  });
  const auctionId = auctionLogs[0].args.auctionId;
  const auctionIdStr = auctionId.toString();
  console.log(`  Auction ID: ${auctionId}`);

  // Verify in open auctions
  const openBefore = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getOpenAuctions",
  });
  console.log(`  Open auctions: [${openBefore.join(", ")}]`);
  assert(
    openBefore.includes(auctionId),
    `Auction ${auctionId} not in open auctions`,
  );

  // ── Step 5: Owner places on-chain bid ──────────────────────────────────────
  step("Owner placing on-chain bid...");
  const bidHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "placeBid",
    args: [auctionId, BID_AMOUNT],
  });
  await waitForTx(publicClient, bidHash, "Bid placed");

  // ── Step 6: Insert Supabase records (seller, secret, deposit, private_bid) ─
  step("Setting up Supabase records...");

  // Upsert seller (seller_id for the secret)
  const { error: sellerErr } = await supabase
    .from("sellers")
    .upsert({ id: SELLER_NAME, address: ownerAccount.address.toLowerCase() }, { onConflict: "id" });
  assert(!sellerErr, `Failed to upsert seller: ${sellerErr?.message}`);
  console.log(`  ok Seller upserted: ${SELLER_NAME} -> ${ownerAccount.address}`);

  // Insert secret (auction_id is PK — FK target for private_bids)
  const { error: secretErr } = await supabase
    .from("secrets")
    .upsert({
      auction_id: auctionIdStr,
      secret_data: "E2E test secret data",
      seller_id: SELLER_NAME,
    }, { onConflict: "auction_id" });
  assert(!secretErr, `Failed to insert secret: ${secretErr?.message}`);
  console.log(`  ok Secret inserted for auction ${auctionIdStr}`);

  // Insert confirmed deposit transfer so bidder has available balance for bidding
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

  // Insert active private bid (web2 bid from bidder)
  const { error: bidErr } = await supabase
    .from("private_bids")
    .insert({
      auction_id: auctionIdStr,
      bidder_address: bidderAccount!.address.toLowerCase(),
      amount: BID_AMOUNT.toString(),
      status: "active",
    });
  assert(!bidErr, `Failed to insert private_bid: ${bidErr?.message}`);
  console.log(`  ok Private bid: ${formatUnits(BID_AMOUNT, USDC_DECIMALS)} USDC from bidder`);

  // Capture starting balances for relative assertions
  const { data: buyerBalBefore } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAccount!.address.toLowerCase())
    .single();
  assert(!!buyerBalBefore, "Bidder should have a balance after deposit + bid");
  const buyerLockedBefore = BigInt(buyerBalBefore!.locked_balance!);
  const buyerAvailBefore = BigInt(buyerBalBefore!.available_balance!);
  console.log(`  Buyer available: ${formatUnits(buyerAvailBefore, USDC_DECIMALS)}, locked: ${formatUnits(buyerLockedBefore, USDC_DECIMALS)}`);

  // ── Step 7: Wait for auction to expire ─────────────────────────────────────
  step("Waiting for auction to expire...");
  const auctionData = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getAuction",
    args: [auctionId],
  });
  await waitForTimestamp(publicClient, auctionData.endTime, "Auction expiry");

  // ── Step 8: CRE broadcast — closes auction + settles bid ───────────────────
  // NOTE: Skip dry run — CRE simulation makes real HTTP calls even without
  // --broadcast, which would settle the bid before the on-chain close happens.
  step("Running CRE secret-marketplace-auction-closer with broadcast...");
  runCRE({ workflow: "secret-marketplace-auction-closer", triggerIndex: 0, broadcast: true });
  console.log(`  ok Broadcast completed`);

  // ── Step 9: Verify on-chain ────────────────────────────────────────────────
  step("Verifying auction is closed on-chain...");
  const finalAuction = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getAuction",
    args: [auctionId],
  });
  assert(
    finalAuction.status === 1,
    `Expected status=1 (Closed), got status=${finalAuction.status}`,
  );
  console.log(`  ok Auction ${auctionId} is Closed (status=1)`);

  const openAfter = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getOpenAuctions",
  });
  assert(
    !openAfter.includes(auctionId),
    `Auction ${auctionId} still in open auctions after close`,
  );
  console.log(`  ok Removed from open auctions`);

  // ── Step 10: Verify bid settled in Supabase ────────────────────────────────
  step("Verifying bid settled in Supabase...");
  const { data: settledBid } = await supabase
    .from("private_bids")
    .select("*")
    .eq("auction_id", auctionIdStr)
    .single();

  assert(!!settledBid, `Private bid not found for auction ${auctionIdStr}`);
  assert(settledBid!.status === "won", `Expected bid status=won, got ${settledBid!.status}`);
  assert(settledBid!.won_at !== null, `Expected won_at to be set`);
  console.log(`  ok Bid status: ${settledBid!.status}, won_at: ${settledBid!.won_at}`);

  // ── Step 11: Verify balances view ──────────────────────────────────────────
  step("Verifying balances view...");

  // Buyer: locked_balance should decrease (bid moved from active -> won)
  const { data: buyerBal } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAccount!.address.toLowerCase())
    .single();
  assert(!!buyerBal, "Bidder should still have a balance row");
  const buyerLockedAfter = BigInt(buyerBal!.locked_balance!);
  assert(
    buyerLockedAfter < buyerLockedBefore,
    `Buyer locked_balance did not decrease: ${buyerLockedBefore} -> ${buyerLockedAfter}`,
  );
  console.log(`  ok Buyer locked: ${formatUnits(buyerLockedBefore, USDC_DECIMALS)} -> ${formatUnits(buyerLockedAfter, USDC_DECIMALS)}`);

  // Seller: total_from_won_bids should include the bid amount
  const { data: sellerBal } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", ownerAccount.address.toLowerCase())
    .maybeSingle();
  assert(!!sellerBal, "Seller should have a balance row from won bid earnings");
  const sellerEarnings = BigInt(sellerBal!.total_from_won_bids!);
  assert(
    sellerEarnings >= BID_AMOUNT,
    `Seller total_from_won_bids (${sellerEarnings}) should be >= ${BID_AMOUNT}`,
  );
  console.log(`  ok Seller total_from_won_bids: ${formatUnits(sellerEarnings, USDC_DECIMALS)}`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  banner("PASS -- Auction Closer E2E (with Supabase settlement)");
  console.log(`  Auction ID:        ${auctionId}`);
  console.log(`  Event ID:          ${eventId}`);
  console.log(`  Bid Amount:        ${formatUnits(BID_AMOUNT, USDC_DECIMALS)} USDC`);
  console.log(`  On-chain status:   Closed`);
  console.log(`  Supabase bid:      won`);
  console.log(`  Seller earnings:   ${formatUnits(sellerEarnings, USDC_DECIMALS)} USDC`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nx E2E test failed:", err);
    process.exit(1);
  });
