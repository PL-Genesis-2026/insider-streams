/**
 * Auction Closer E2E Test Script
 *
 * Full lifecycle test on Eth Sepolia:
 *   1. Owner creates an ExamplePredictionMarket event
 *   2. Owner creates a SecretMarketplace auction (short duration)
 *   3. Bidder approves USDC + places bid
 *   4. Waits for auction to expire
 *   5. CRE auction-closer simulation (dry run) — detects expired auction
 *   6. CRE auction-closer broadcast — closes auction on-chain
 *   7. Verifies auction is closed and removed from open list
 *
 * Env vars required:
 *   OWNER_PK   — creates event + auction
 *   BIDDER_PK  — places bid (must be different from owner)
 *   RPC_URL    — Eth Sepolia RPC
 *
 * Usage: pnpm e2e:auction-closer
 */

import "dotenv/config";

import {
  CONFIDENTIAL_USDC_ADDRESS,
  SECRET_MARKETPLACE_ADDRESS,
  examplePredictionMarketAbi,
  confidentialUsdcAbi,
  secretMarketplaceAbi,
} from "@private-streams/common";
import { parseEventLogs, type Address, type Hex } from "viem";
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

const CONFIDENTIAL_USDC = CONFIDENTIAL_USDC_ADDRESS;
const SECRET_MARKETPLACE = SECRET_MARKETPLACE_ADDRESS;

const { publicClient, ownerClient, ownerAccount, bidderClient, bidderAccount } =
  createClients({ ownerPk: OWNER_PK, bidderPk: BIDDER_PK, rpcUrl: RPC_URL });

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_BALANCE = 10_000_000n; // 10 USDC
const MINT_AMOUNT = 10_000_000_000n; // 10,000 USDC
const APPROVAL_AMOUNT = 100_000_000_000n; // 100,000 USDC blanket
const MIN_ALLOWANCE = 10_000_000n; // 10 USDC — threshold to trigger approve
const BID_AMOUNT = 2_000_000n; // 2 USDC
const EVENT_DURATION = BigInt(60); // 60 seconds
const AUCTION_DURATION = 60; // 60 seconds
const SELLER_NAME = "TestSeller";

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  // Read the ExamplePredictionMarket address from SecretMarketplace
  const SIMPLE_MARKET = (await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "marketplace",
  })) as Address;

  banner("Auction Closer E2E Test");
  console.log(`  Owner:             ${ownerAccount.address}`);
  console.log(`  Bidder:            ${bidderAccount!.address}`);
  console.log(`  ConfidentialUSDC:          ${CONFIDENTIAL_USDC}`);
  console.log(`  SimpleMarket:      ${SIMPLE_MARKET}`);
  console.log(`  SecretMarketplace: ${SECRET_MARKETPLACE}`);

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

  // ── Step 4: Create auction (admin-only, 4 args) ────────────────────────────
  step("Owner creating auction...");
  const now = BigInt(Math.floor(Date.now() / 1000));
  const endTime = now + BigInt(AUCTION_DURATION);

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

  // ── Step 5: Owner places bid (admin-only, 2 args) ──────────────────────────
  step("Owner placing bid...");
  const bidHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "placeBid",
    args: [auctionId, BID_AMOUNT],
  });
  await waitForTx(publicClient, bidHash, "Bid placed");

  // ── Step 6: Wait for auction to expire ──────────────────────────────────────
  step("Waiting for auction to expire...");
  const auctionData = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getAuction",
    args: [auctionId],
  });
  await waitForTimestamp(publicClient, auctionData.endTime, "Auction expiry");

  // ── Step 7: CRE dry run ─────────────────────────────────────────────────────
  step("Running CRE auction-closer simulation (dry run)...");
  const dryOutput = runCRE({ workflow: "auction-closer", triggerIndex: 0 });
  const detectedExpired =
    dryOutput.includes("expired") || dryOutput.includes("close");
  console.log(
    `  ${detectedExpired ? "ok" : "WARN"} Simulation ${detectedExpired ? "detected expired auction" : "output did not explicitly mention expired auction"}`,
  );

  // ── Step 8: CRE broadcast ──────────────────────────────────────────────────
  step("Running CRE auction-closer with broadcast...");
  runCRE({ workflow: "auction-closer", triggerIndex: 0, broadcast: true });

  // ── Step 9: Verify on-chain ─────────────────────────────────────────────────
  step("Verifying auction is closed on-chain...");
  const finalAuction = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getAuction",
    args: [auctionId],
  });
  // AuctionStatus: 0=Open, 1=Closed, 2=ForceClosed
  assert(
    finalAuction.status === 1,
    `Expected status=1 (Closed), got status=${finalAuction.status}`,
  );
  console.log(`  ok Auction ${auctionId} is Closed (status=1)`);

  // Verify removed from open auctions
  const openAfter = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getOpenAuctions",
  });
  assert(
    !openAfter.includes(auctionId),
    `Auction ${auctionId} still in open auctions after close`,
  );
  console.log(`  ok Open auctions after close: [${openAfter.join(", ")}]`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  banner("PASS — Auction Closer E2E");
  console.log(`  Auction ID:        ${auctionId}`);
  console.log(`  Event ID:          ${eventId}`);
  console.log(`  Bid Amount:        ${BID_AMOUNT}`);
  console.log(`  On-chain status:   Closed`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nx E2E test failed:", err);
    process.exit(1);
  });
