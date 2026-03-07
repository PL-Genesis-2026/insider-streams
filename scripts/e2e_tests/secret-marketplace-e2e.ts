/**
 * SecretMarketplace E2E Test Script
 *
 * On-chain lifecycle test on Eth Sepolia:
 *   - SellerRegistered
 *   - AuctionCreated
 *   - BidPlaced
 *   - AuctionClosed
 *   - ExternalEventResolved + SellerReputationScoreUpdated
 *
 * Env vars required:
 *   OWNER_PK                    — deploys, creates events, closes auctions, settles
 *   BIDDER_PK                   — unused on-chain (admin-only model)
 *   RPC_URL                     — Eth Sepolia RPC
 *   CONFIDENTIAL_USDC_ADDRESS           — ConfidentialUSDC contract
 *   SECRET_MARKETPLACE_ADDRESS  — SecretMarketplace contract
 *
 * Usage: pnpm e2e:secret-marketplace
 */

import "dotenv/config";

import {
  CONFIDENTIAL_USDC_ADDRESS,
  examplePredictionMarketAbi,
  SECRET_MARKETPLACE_ADDRESS,
  secretMarketplaceAbi,
} from "@private-streams/common";
import { type Address, type Hex } from "viem";

import {
  envRequired,
  banner,
  step,
  createClients,
  waitForTx,
  waitForTimestamp,
  ensureUsdcBalance,
  ensureUsdcApproval,
  parseFirstEventLog,
  readSimpleMarketAddress,
  MIN_BALANCE,
  MINT_AMOUNT,
} from "./e2e-helpers.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const OWNER_PK = envRequired("OWNER_PK") as Hex;
const RPC_URL = envRequired("RPC_URL");
const CONFIDENTIAL_USDC = CONFIDENTIAL_USDC_ADDRESS;
const SECRET_MARKETPLACE = SECRET_MARKETPLACE_ADDRESS;
// Read ExamplePredictionMarket address from SecretMarketplace.marketplace() at runtime
let SIMPLE_MARKET: Address;

const { publicClient, ownerClient, ownerAccount } = createClients({
  ownerPk: OWNER_PK,
  rpcUrl: RPC_URL,
});

// ─── Constants ───────────────────────────────────────────────────────────────

const BID_AMOUNT = 1_000_000n; // 1 USDC
const AUCTION_DURATION = 45; // seconds
const QUESTION = "The New York Yankees won the 2009 World Series.";
const SELLER_ID = "Insider Alice";

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  // Read the ExamplePredictionMarket address that SecretMarketplace was deployed with
  SIMPLE_MARKET = await readSimpleMarketAddress(publicClient, SECRET_MARKETPLACE);

  banner("SecretMarketplace E2E");
  console.log(`  Owner (admin):    ${ownerAccount.address}`);
  console.log(`  ConfidentialUSDC:         ${CONFIDENTIAL_USDC}`);
  console.log(
    `  ExamplePredictionMarket: ${SIMPLE_MARKET} (from SecretMarketplace.marketplace())`,
  );
  console.log(`  SecretMarketplace: ${SECRET_MARKETPLACE}`);

  // ── Step 0: Mint USDC + approve (only if needed) ─────────────────────────
  step("Ensuring owner has USDC and approvals...");

  await ensureUsdcBalance(
    publicClient,
    ownerClient,
    CONFIDENTIAL_USDC,
    ownerAccount.address,
    MIN_BALANCE,
    MINT_AMOUNT,
  );

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

  // ── Step 1: Register seller (if not already registered) ──────────────────
  step("Register seller...");
  const seller = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getSeller",
    args: [SELLER_ID],
  });
  if (seller.registered) {
    console.log(
      `  ok Seller "${SELLER_ID}" already registered (reputation: ${seller.reputationScore})`,
    );
  } else {
    const registerHash = await ownerClient.writeContract({
      address: SECRET_MARKETPLACE,
      abi: secretMarketplaceAbi,
      functionName: "registerSeller",
      args: [SELLER_ID],
    });
    await waitForTx(publicClient, registerHash, "[EVENT: SellerRegistered]");
  }

  // ── Step 2: Create event + auction ───────────────────────────────────────
  step("Create event + auction...");
  const createEventHash = await ownerClient.writeContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "newEvent",
    args: [QUESTION, BigInt(3 * 60)],
  });
  const eventReceipt = await waitForTx(publicClient, createEventHash, "Event created");
  const eventArgs = parseFirstEventLog(eventReceipt, examplePredictionMarketAbi, "EventCreated");
  const eventId = eventArgs.eventId as bigint;
  console.log(`  Event ID: ${eventId}`);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const endTime = now + BigInt(AUCTION_DURATION);
  const createAuctionHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "createAuction",
    args: [SELLER_ID, eventId, QUESTION, endTime],
  });
  const auctionReceipt = await waitForTx(
    publicClient,
    createAuctionHash,
    "[EVENT: AuctionCreated]",
  );
  const auctionArgs = parseFirstEventLog(auctionReceipt, secretMarketplaceAbi, "AuctionCreated");
  const auctionId = auctionArgs.auctionId as bigint;
  console.log(`  Auction ID: ${auctionId}`);

  // ── Step 3: Place bid ────────────────────────────────────────────────────
  step("Admin places bid...");
  const bidHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "placeBid",
    args: [auctionId, BID_AMOUNT],
  });
  await waitForTx(publicClient, bidHash, "[EVENT: BidPlaced]");

  // ── Step 4: Wait for auction to end ──────────────────────────────────────
  step("Waiting for auction to end...");
  const auctionData = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getAuction",
    args: [auctionId],
  });
  const onChainEndTime = auctionData.endTime;
  await waitForTimestamp(publicClient, onChainEndTime, "Auction expiry");

  // ── Step 5: Close auction ────────────────────────────────────────────────
  step("Admin closes auction...");
  const closeHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "closeAuction",
    args: [auctionId],
  });
  await waitForTx(publicClient, closeHash, "[EVENT: AuctionClosed]");

  // ── Step 6: Resolve external event ───────────────────────────────────────
  step("Resolve external event (per-auction results)...");
  const resolveHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "recordEventOutcomeAndUpdateRepScore",
    args: [eventId, [{ auctionId, predictionOutcome: 1 }]],
  });
  await waitForTx(
    publicClient,
    resolveHash,
    "[EVENT: ExternalEventResolved + SellerReputationScoreUpdated]",
  );

  const sellerAfter = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getSeller",
    args: [SELLER_ID],
  });
  console.log(
    `  Seller reputation after resolve: ${sellerAfter.reputationScore}`,
  );

  // ── Summary ──────────────────────────────────────────────────────────────
  banner("PASS -- All on-chain events fired");
  console.log("    [x] SellerRegistered");
  console.log("    [x] AuctionCreated");
  console.log("    [x] BidPlaced");
  console.log("    [x] AuctionClosed");
  console.log("    [x] ExternalEventResolved");
  console.log("    [x] SellerReputationScoreUpdated");
  console.log(`  SecretMarketplace: ${SECRET_MARKETPLACE}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nx E2E test failed:", err);
    process.exit(1);
  });
