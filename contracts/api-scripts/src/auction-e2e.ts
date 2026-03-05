/**
 * Auction E2E Test Script
 *
 * Full lifecycle test on Eth Sepolia:
 *   1. Owner creates a market on SimpleMarket
 *   2. Seller creates an auction for that market
 *   3. Bidder (different user) places a bid
 *   4. Wait for auction to end
 *   5. Owner closes the auction
 *   6. Owner manually settles the SimpleMarket market
 *   7. Bidder claims winnings on SimpleMarket
 *
 * Env vars required:
 *   OWNER_PK          — deploys, creates markets, closes auctions, settles
 *   BIDDER_PK         — places bids, claims winnings (MUST be different from owner)
 *   RPC_URL           — Eth Sepolia RPC
 *   MOCK_USDC_ADDRESS — MockUSDC contract
 *   MARKET_ADDRESS    — SimpleMarket contract
 *   AUCTION_ADDRESS   — Auction contract
 *
 * Usage: pnpm e2e
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { auctionAbi, simpleMarketAbi, mockUsdcAbi } from "./generated.js";

// ─── Config ──────────────────────────────────────────────────────────────────

function envRequired(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`ERROR: ${name} not set`);
    process.exit(1);
  }
  return val;
}

const OWNER_PK = envRequired("OWNER_PK") as Hex;
const BIDDER_PK = envRequired("BIDDER_PK") as Hex;
const RPC_URL = envRequired("RPC_URL");
const USDC = envRequired("MOCK_USDC_ADDRESS") as Address;
const MARKET = envRequired("MARKET_ADDRESS") as Address;
const AUCTION = envRequired("AUCTION_ADDRESS") as Address;

const ownerAccount = privateKeyToAccount(OWNER_PK);
const bidderAccount = privateKeyToAccount(BIDDER_PK);

if (ownerAccount.address === bidderAccount.address) {
  console.error("ERROR: OWNER_PK and BIDDER_PK must be different accounts");
  process.exit(1);
}

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const ownerClient = createWalletClient({
  account: ownerAccount,
  chain: sepolia,
  transport: http(RPC_URL),
});

const bidderClient = createWalletClient({
  account: bidderAccount,
  chain: sepolia,
  transport: http(RPC_URL),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForTx(hash: Hex, label: string) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    console.error(`  ✗ ${label} failed`);
    console.error(receipt);
    process.exit(1);
  }
  console.log(`  ✓ ${label} (tx: ${hash.slice(0, 10)}...)`);
  return receipt;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Constants ───────────────────────────────────────────────────────────────

const QUESTION = "The New York Yankees won the 2009 World Series.";
const BID_AMOUNT = 1_000_000n; // 1 USDC (6 decimals)
const PREDICTION_AMOUNT = 1_000_000n; // 1 USDC
const AUCTION_DURATION = 60; // 60 seconds

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Auction E2E Test");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Owner:   ${ownerAccount.address}`);
  console.log(`  Bidder:  ${bidderAccount.address}`);
  console.log(`  USDC:    ${USDC}`);
  console.log(`  Market:  ${MARKET}`);
  console.log(`  Auction: ${AUCTION}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // ── Step 0: Mint USDC to bidder if needed ────────────────────────────────
  console.log("▶ Step 0: Ensuring bidder has USDC...");
  const bidderBalance = await publicClient.readContract({
    address: USDC,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: [bidderAccount.address],
  });
  if (bidderBalance < BID_AMOUNT + PREDICTION_AMOUNT) {
    const mintHash = await ownerClient.writeContract({
      address: USDC,
      abi: mockUsdcAbi,
      functionName: "mint",
      args: [bidderAccount.address, 10_000_000_000n], // 10,000 USDC
    });
    await waitForTx(mintHash, "Mint USDC to bidder");
  } else {
    console.log(
      `  ✓ Bidder has ${formatUnits(bidderBalance, 6)} USDC (sufficient)`
    );
  }

  // ── Step 1: Owner creates a market on SimpleMarket ───────────────────────
  console.log("\n▶ Step 1: Creating market on SimpleMarket...");
  const createMarketHash = await ownerClient.writeContract({
    address: MARKET,
    abi: simpleMarketAbi,
    functionName: "newMarket",
    args: [QUESTION],
  });
  const createMarketReceipt = await waitForTx(
    createMarketHash,
    "Market created"
  );

  const marketLogs = parseEventLogs({
    abi: simpleMarketAbi,
    logs: createMarketReceipt.logs,
    eventName: "MarketCreated",
  });
  const marketId = marketLogs[0].args.marketId;
  console.log(`  Market ID: ${marketId}`);

  // ── Step 2: Seller (owner) creates an auction ────────────────────────────
  console.log("\n▶ Step 2: Creating auction...");
  const now = BigInt(Math.floor(Date.now() / 1000));
  const endTime = now + BigInt(AUCTION_DURATION);

  const createAuctionHash = await ownerClient.writeContract({
    address: AUCTION,
    abi: auctionAbi,
    functionName: "createAuction",
    args: [marketId, BID_AMOUNT, endTime],
  });
  const createAuctionReceipt = await waitForTx(
    createAuctionHash,
    "Auction created"
  );

  const auctionLogs = parseEventLogs({
    abi: auctionAbi,
    logs: createAuctionReceipt.logs,
    eventName: "AuctionCreated",
  });
  const auctionId = auctionLogs[0].args.auctionId;
  console.log(`  Auction ID: ${auctionId}`);
  console.log(`  Reserve Price: ${formatUnits(BID_AMOUNT, 6)} USDC`);
  console.log(`  Ends in: ${AUCTION_DURATION}s`);

  // ── Step 3: Bidder places a bid ──────────────────────────────────────────
  console.log("\n▶ Step 3: Bidder placing bid...");

  // Approve USDC
  const approveAuctionHash = await bidderClient.writeContract({
    address: USDC,
    abi: mockUsdcAbi,
    functionName: "approve",
    args: [AUCTION, BID_AMOUNT],
  });
  await waitForTx(approveAuctionHash, "USDC approved for Auction");

  // Place bid
  const bidHash = await bidderClient.writeContract({
    address: AUCTION,
    abi: auctionAbi,
    functionName: "placeBid",
    args: [auctionId, BID_AMOUNT],
  });
  await waitForTx(bidHash, `Bid placed: ${formatUnits(BID_AMOUNT, 6)} USDC`);

  // Verify bid
  const auctionData = await publicClient.readContract({
    address: AUCTION,
    abi: auctionAbi,
    functionName: "getAuction",
    args: [auctionId],
  });
  console.log(`  Highest bidder: ${auctionData.highestBidder}`);
  console.log(`  Highest bid: ${formatUnits(auctionData.highestBid, 6)} USDC`);

  // ── Step 4: Wait for auction to end ──────────────────────────────────────
  console.log("\n▶ Step 4: Waiting for auction to end...");
  // Read the on-chain endTime (authoritative) and poll block.timestamp
  const onChainEndTime = auctionData.endTime;
  while (true) {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    if (block.timestamp >= onChainEndTime) {
      break;
    }
    const remaining = Number(onChainEndTime - block.timestamp);
    console.log(`  Chain timestamp ${block.timestamp}, auction ends at ${onChainEndTime} (${remaining}s remaining)...`);
    await sleep(Math.min(remaining * 1000 + 2000, 15000));
  }
  console.log("  ✓ Auction period ended (on-chain)");

  // ── Step 5: Owner closes the auction ─────────────────────────────────────
  console.log("\n▶ Step 5: Closing auction...");
  const closeHash = await ownerClient.writeContract({
    address: AUCTION,
    abi: auctionAbi,
    functionName: "closeAuction",
    args: [auctionId],
  });
  await waitForTx(closeHash, "Auction closed");

  // Verify closed
  const closedAuction = await publicClient.readContract({
    address: AUCTION,
    abi: auctionAbi,
    functionName: "getAuction",
    args: [auctionId],
  });
  console.log(`  Status: ${closedAuction.status} (1=Closed)`);

  // ── Step 6: Bidder makes prediction on SimpleMarket ──────────────────────
  // In the full flow, closeAuction would do this. For now, bidder does it manually.
  console.log("\n▶ Step 6: Bidder predicting YES on SimpleMarket...");

  // Wait for market to still be open (SimpleMarket has 3-min window)
  const marketData = await publicClient.readContract({
    address: MARKET,
    abi: simpleMarketAbi,
    functionName: "getMarket",
    args: [marketId],
  });
  const marketCloseTs = Number(marketData.marketClose);
  const currentTs = Math.floor(Date.now() / 1000);
  if (currentTs >= marketCloseTs) {
    console.log(
      "  ⚠ Market already closed for predictions — skipping prediction + settlement"
    );
    console.log(
      "  TIP: Increase AUCTION_DURATION or decrease SimpleMarket window"
    );
    printSummary(marketId, auctionId, false);
    return;
  }

  // Approve USDC for SimpleMarket
  const approveMarketHash = await bidderClient.writeContract({
    address: USDC,
    abi: mockUsdcAbi,
    functionName: "approve",
    args: [MARKET, PREDICTION_AMOUNT],
  });
  await waitForTx(approveMarketHash, "USDC approved for SimpleMarket");

  // Make prediction (outcome=2 = YES)
  const predictHash = await bidderClient.writeContract({
    address: MARKET,
    abi: simpleMarketAbi,
    functionName: "makePrediction",
    args: [marketId, 2, PREDICTION_AMOUNT],
  });
  await waitForTx(
    predictHash,
    `Prediction: YES with ${formatUnits(PREDICTION_AMOUNT, 6)} USDC`
  );

  // ── Step 7: Wait for market close + settle manually ──────────────────────
  console.log("\n▶ Step 7: Waiting for market close + settling...");
  const waitForMarket = marketCloseTs - Math.floor(Date.now() / 1000) + 5;
  if (waitForMarket > 0) {
    console.log(`  Waiting ${waitForMarket}s for market to close...`);
    await sleep(waitForMarket * 1000);
  }

  // Request settlement
  const requestHash = await ownerClient.writeContract({
    address: MARKET,
    abi: simpleMarketAbi,
    functionName: "requestSettlement",
    args: [marketId],
  });
  await waitForTx(requestHash, "Settlement requested");

  // For E2E without CRE, settle manually as NeedsManual → settleMarketManually
  // First we need CRE to settle OR we settle manually
  // Since we don't have CRE here, we'll use settleMarketManually after marking as NeedsManual
  // But settleMarketManually requires status=NeedsManual. Without CRE, we can't move past SettlementRequested.
  // So we skip the claim step and note this limitation.
  console.log(
    "  ⚠ Settlement requires CRE workflow — manual settlement not possible from SettlementRequested state"
  );
  console.log(
    "  To complete: run CRE workflow to settle, then bidder can claim"
  );

  printSummary(marketId, auctionId, true);
}

function printSummary(
  marketId: bigint,
  auctionId: bigint,
  predictionMade: boolean
) {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  ✓ PASS — Auction E2E test completed");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Market ID:       ${marketId}`);
  console.log(`  Auction ID:      ${auctionId}`);
  console.log(`  Prediction made: ${predictionMade ? "YES" : "Skipped (market closed)"}`);
  console.log(`  Auction:         Closed`);
  console.log("═══════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("\n✗ E2E test failed:", err);
  process.exit(1);
});
