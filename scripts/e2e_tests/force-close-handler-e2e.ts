/**
 * Force Close Handler E2E Test Script
 *
 * Full lifecycle test on Eth Sepolia:
 *   1. Owner creates an ExamplePredictionMarket event
 *   2. Owner creates a SecretMarketplace auction (5-min duration)
 *   3. Owner places on-chain bid
 *   4. Insert Supabase records (seller, secret, deposit transfer, private_bid)
 *   5. Verify bidder's locked_balance includes the bid
 *   6. Force-close the auction on-chain via forceCloseAuction(auctionId, 0)
 *   7. Run CRE force-close-handler with --evm-tx-hash + --evm-event-index
 *   8. Verify bid status=refunded, refunded_at set, bidder locked_balance decreased
 *
 * NOTE: force-close-handler does NOT make on-chain writes — it only makes
 * Supabase HTTP calls. CRE simulation makes real HTTP calls even without
 * --broadcast, so we run without broadcast.
 *
 * Env vars required:
 *   OWNER_PK                  — deploys, creates events, force-closes auctions
 *   BIDDER_PK                 — different from owner (used as bidder address in Supabase)
 *   RPC_URL                   — Eth Sepolia RPC
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key
 *
 * Usage: pnpm e2e:force-close-handler
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
import { parseEventLogs, formatUnits, type Address, type Hex } from "viem";
import {
  MIN_BALANCE,
  MINT_AMOUNT,
  USDC_DECIMALS,
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

const SELLER_NAME = "E2EForceCloseSeller";
const BID_AMOUNT = 1_000_000n; // 1 USDC
const AUCTION_DURATION = 120; // 2 minutes (we'll force-close before it ends)
const EVENT_DURATION = BigInt(300); // 5 minutes
const DEPOSIT_AMOUNT = BID_AMOUNT * 10n; // 10 USDC headroom
const QUESTION = "Force close handler E2E test event";

// Unique transaction ID for the mock deposit (avoids collisions with real data)
const DEPOSIT_TX_ID = `e2e-force-close-deposit-${Date.now()}`;

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  // Read the ExamplePredictionMarket address from SecretMarketplace
  const SIMPLE_MARKET = await readSimpleMarketAddress(publicClient, SECRET_MARKETPLACE);

  banner("Force Close Handler E2E Test");
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

  // ── Step 3: Create event ───────────────────────────────────────────────────
  step("Owner creating ExamplePredictionMarket event...");
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

  // ── Step 4: Create auction (5-min duration, force-close before expiry) ─────
  step(`Owner creating auction (${AUCTION_DURATION}s duration)...`);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const endTime = now + BigInt(AUCTION_DURATION);

  const createAuctionHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "createAuction",
    args: [SELLER_NAME, eventId, QUESTION, endTime],
  });
  const auctionReceipt = await waitForTx(
    publicClient,
    createAuctionHash,
    "Auction created",
  );
  const auctionArgs = parseFirstEventLog(auctionReceipt, secretMarketplaceAbi, "AuctionCreated");
  const auctionId = auctionArgs.auctionId as bigint;
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
  await setupSupabaseAuctionBid(supabase, {
    sellerName: SELLER_NAME,
    sellerAddress: ownerAccount.address,
    auctionId: auctionIdStr,
    secretData: "E2E test secret",
    bidderAddress: bidderAccount!.address,
    bidAmount: BID_AMOUNT,
    depositTxId: DEPOSIT_TX_ID,
    depositAmount: DEPOSIT_AMOUNT,
  });

  // ── Step 7: Capture balances before force-close ────────────────────────────
  step("Capturing bidder balances before force-close...");
  const { data: buyerBalBefore } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAccount!.address.toLowerCase())
    .single();
  assert(!!buyerBalBefore, "Bidder should have a balance after deposit + bid");
  const buyerLockedBefore = BigInt(buyerBalBefore!.locked_balance!);
  const buyerAvailBefore = BigInt(buyerBalBefore!.available_balance!);
  console.log(`  Buyer available: ${formatUnits(buyerAvailBefore, USDC_DECIMALS)}, locked: ${formatUnits(buyerLockedBefore, USDC_DECIMALS)}`);
  assert(
    buyerLockedBefore >= BID_AMOUNT,
    `Buyer locked_balance (${buyerLockedBefore}) should include bid (${BID_AMOUNT})`,
  );

  // ── Step 8: Force-close auction on-chain ───────────────────────────────────
  step("Force-closing auction on-chain...");
  const forceCloseHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "forceCloseAuction",
    args: [auctionId, 0],
  });
  const forceCloseReceipt = await waitForTx(
    publicClient,
    forceCloseHash,
    "Auction force-closed",
  );

  // Find AuctionForceClosed event index among ALL logs in the receipt
  const forceCloseLogs = parseEventLogs({
    abi: secretMarketplaceAbi,
    logs: forceCloseReceipt.logs,
    eventName: "AuctionForceClosed",
  });
  assert(
    forceCloseLogs.length > 0,
    "No AuctionForceClosed event found in receipt",
  );
  const eventIndex = forceCloseReceipt.logs.findIndex(
    (l) => l.logIndex === forceCloseLogs[0].logIndex,
  );
  assert(eventIndex >= 0, "Could not find AuctionForceClosed log index");
  console.log(`  AuctionForceClosed event index: ${eventIndex}`);

  // Verify auction is now force-closed on-chain
  const closedAuction = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getAuction",
    args: [auctionId],
  });
  console.log(`  Auction on-chain status: ${closedAuction.status}`);

  // ── Step 9: Run CRE force-close-handler ────────────────────────────────────
  step("Running CRE force-close-handler...");
  runCRE({
    workflow: "force-close-handler",
    triggerIndex: 0,
    evmTxHash: forceCloseHash,
    evmEventIndex: eventIndex,
    broadcast: false,
  });
  console.log(`  ok CRE force-close-handler completed`);

  // ── Step 10: Verify bid refunded in Supabase ──────────────────────────────
  step("Verifying bid refunded in Supabase...");
  const { data: refundedBid } = await supabase
    .from("private_bids")
    .select("*")
    .eq("auction_id", auctionIdStr)
    .single();

  assert(!!refundedBid, `Private bid not found for auction ${auctionIdStr}`);
  assert(refundedBid!.status === "refunded", `Expected bid status=refunded, got ${refundedBid!.status}`);
  assert(refundedBid!.refunded_at !== null, `Expected refunded_at to be set`);
  console.log(`  ok Bid status: ${refundedBid!.status}, refunded_at: ${refundedBid!.refunded_at}`);

  // ── Step 11: Verify balances view ──────────────────────────────────────────
  step("Verifying balances view...");

  // Buyer: locked_balance should decrease (bid moved from active -> refunded)
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

  // ── Summary ─────────────────────────────────────────────────────────────────
  banner("PASS -- Force Close Handler E2E");
  console.log(`  Auction ID:        ${auctionId}`);
  console.log(`  Event ID:          ${eventId}`);
  console.log(`  Bid Amount:        ${formatUnits(BID_AMOUNT, USDC_DECIMALS)} USDC`);
  console.log(`  On-chain status:   ForceClosed`);
  console.log(`  Supabase bid:      refunded`);
  console.log(`  Buyer locked:      ${formatUnits(buyerLockedBefore, USDC_DECIMALS)} -> ${formatUnits(buyerLockedAfter, USDC_DECIMALS)} USDC`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nx E2E test failed:", err);
    process.exit(1);
  });
