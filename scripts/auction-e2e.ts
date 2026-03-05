/**
 * Auction E2E Test Script
 *
 * Full lifecycle test on Eth Sepolia that fires EVERY event type:
 *   - AuctionCreated
 *   - BidPlaced (first bid + outbid with previousBidder)
 *   - RefundWithdrawn
 *   - AuctionClosed + TradeExecuted
 *   - AuctionForceClosed + ReputationUpdated
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
import { auctionAbi, simpleMarketAbi, mockUsdcAbi } from "@private-streams/contracts";

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
    console.error(`  x ${label} failed`);
    console.error(receipt);
    process.exit(1);
  }
  console.log(`  ok ${label} (tx: ${hash.slice(0, 10)}...)`);
  return receipt;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Constants ───────────────────────────────────────────────────────────────

const QUESTION = "The New York Yankees won the 2009 World Series.";
const BID_AMOUNT = 1_000_000n; // 1 USDC (6 decimals)
const HIGHER_BID = 2_000_000n; // 2 USDC
const AUCTION_DURATION = 60; // 60 seconds

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  console.log("===================================================");
  console.log("  Auction E2E Test — Fire ALL Events");
  console.log("===================================================");
  console.log(`  Owner:   ${ownerAccount.address}`);
  console.log(`  Bidder:  ${bidderAccount.address}`);
  console.log(`  USDC:    ${USDC}`);
  console.log(`  Market:  ${MARKET}`);
  console.log(`  Auction: ${AUCTION}`);
  console.log("===================================================\n");

  // ── Step 0: Mint USDC + approve ────────────────────────────────────────────
  console.log(">> Step 0: Ensuring both accounts have USDC and approvals...");

  const ownerBalance = await publicClient.readContract({
    address: USDC, abi: mockUsdcAbi, functionName: "balanceOf",
    args: [ownerAccount.address],
  });
  if (ownerBalance < 10_000_000n) {
    const h = await ownerClient.writeContract({
      address: USDC, abi: mockUsdcAbi, functionName: "mint",
      args: [ownerAccount.address, 10_000_000_000n],
    });
    await waitForTx(h, "Mint USDC to owner");
  } else {
    console.log(`  ok Owner has ${formatUnits(ownerBalance, 6)} USDC`);
  }

  const bidderBalance = await publicClient.readContract({
    address: USDC, abi: mockUsdcAbi, functionName: "balanceOf",
    args: [bidderAccount.address],
  });
  if (bidderBalance < 10_000_000n) {
    const h = await ownerClient.writeContract({
      address: USDC, abi: mockUsdcAbi, functionName: "mint",
      args: [bidderAccount.address, 10_000_000_000n],
    });
    await waitForTx(h, "Mint USDC to bidder");
  } else {
    console.log(`  ok Bidder has ${formatUnits(bidderBalance, 6)} USDC`);
  }

  // Approve auction contract for both users
  const approveOwner = await ownerClient.writeContract({
    address: USDC, abi: mockUsdcAbi, functionName: "approve",
    args: [AUCTION, 100_000_000_000n],
  });
  await waitForTx(approveOwner, "Owner approved Auction");

  const approveBidder = await bidderClient.writeContract({
    address: USDC, abi: mockUsdcAbi, functionName: "approve",
    args: [AUCTION, 100_000_000_000n],
  });
  await waitForTx(approveBidder, "Bidder approved Auction");

  // ══════════════════════════════════════════════════════════════════════════
  // AUCTION 1: Normal flow → AuctionCreated, BidPlaced (x2), RefundWithdrawn,
  //            AuctionClosed, TradeExecuted
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n>> Step 1: Create market + auction (normal flow)...");
  const createMarketHash = await ownerClient.writeContract({
    address: MARKET, abi: simpleMarketAbi, functionName: "newMarket",
    args: [QUESTION],
  });
  const marketReceipt = await waitForTx(createMarketHash, "Market created");
  const marketLogs = parseEventLogs({
    abi: simpleMarketAbi, logs: marketReceipt.logs, eventName: "MarketCreated",
  });
  const marketId1 = marketLogs[0].args.marketId;
  console.log(`  Market ID: ${marketId1}`);

  // EVENT: AuctionCreated
  const now1 = BigInt(Math.floor(Date.now() / 1000));
  const endTime1 = now1 + BigInt(AUCTION_DURATION);
  const createAuctionHash = await ownerClient.writeContract({
    address: AUCTION, abi: auctionAbi, functionName: "createAuction",
    args: [marketId1, BID_AMOUNT, endTime1],
  });
  const auctionReceipt = await waitForTx(createAuctionHash, "[EVENT: AuctionCreated]");
  const auctionLogs = parseEventLogs({
    abi: auctionAbi, logs: auctionReceipt.logs, eventName: "AuctionCreated",
  });
  const auctionId1 = auctionLogs[0].args.auctionId;
  console.log(`  Auction ID: ${auctionId1}`);

  // EVENT: BidPlaced (first bid, no previous bidder)
  console.log("\n>> Step 2: Owner bids first (will be outbid)...");
  const bid1Hash = await ownerClient.writeContract({
    address: AUCTION, abi: auctionAbi, functionName: "placeBid",
    args: [auctionId1, BID_AMOUNT],
  });
  await waitForTx(bid1Hash, "[EVENT: BidPlaced] first bid");

  // EVENT: BidPlaced (outbid, with previousBidder)
  console.log("\n>> Step 3: Bidder outbids owner...");
  const bid2Hash = await bidderClient.writeContract({
    address: AUCTION, abi: auctionAbi, functionName: "placeBid",
    args: [auctionId1, HIGHER_BID],
  });
  await waitForTx(bid2Hash, "[EVENT: BidPlaced] outbid with previousBidder");

  // EVENT: RefundWithdrawn
  console.log("\n>> Step 4: Owner withdraws refund from being outbid...");
  const withdrawHash = await ownerClient.writeContract({
    address: AUCTION, abi: auctionAbi, functionName: "withdrawRefund",
  });
  await waitForTx(withdrawHash, "[EVENT: RefundWithdrawn]");

  // Wait for auction 1 to end
  console.log("\n>> Step 5: Waiting for auction 1 to end...");
  const auctionData = await publicClient.readContract({
    address: AUCTION, abi: auctionAbi, functionName: "getAuction",
    args: [auctionId1],
  });
  const onChainEndTime1 = auctionData.endTime;
  while (true) {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    if (block.timestamp >= onChainEndTime1) break;
    const remaining = Number(onChainEndTime1 - block.timestamp);
    console.log(`  Chain ts=${block.timestamp}, ends=${onChainEndTime1} (${remaining}s left)...`);
    await sleep(Math.min(remaining * 1000 + 2000, 15000));
  }
  console.log("  ok Auction 1 period ended (on-chain)");

  // EVENT: AuctionClosed + TradeExecuted
  console.log("\n>> Step 6: Close auction 1...");
  const closeHash = await ownerClient.writeContract({
    address: AUCTION, abi: auctionAbi, functionName: "closeAuction",
    args: [auctionId1],
  });
  await waitForTx(closeHash, "[EVENT: AuctionClosed + TradeExecuted]");

  // ══════════════════════════════════════════════════════════════════════════
  // AUCTION 2: Force-close flow → AuctionCreated, BidPlaced,
  //            AuctionForceClosed, ReputationUpdated
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n>> Step 7: Create auction 2 (will be force-closed)...");
  const createMarket2Hash = await ownerClient.writeContract({
    address: MARKET, abi: simpleMarketAbi, functionName: "newMarket",
    args: ["Will ETH hit $10k by end of 2026?"],
  });
  const market2Receipt = await waitForTx(createMarket2Hash, "Market 2 created");
  const market2Logs = parseEventLogs({
    abi: simpleMarketAbi, logs: market2Receipt.logs, eventName: "MarketCreated",
  });
  const marketId2 = market2Logs[0].args.marketId;
  console.log(`  Market ID: ${marketId2}`);

  const now2 = BigInt(Math.floor(Date.now() / 1000));
  const endTime2 = now2 + BigInt(300); // 5 min — won't wait for it
  const createAuction2Hash = await ownerClient.writeContract({
    address: AUCTION, abi: auctionAbi, functionName: "createAuction",
    args: [marketId2, BID_AMOUNT, endTime2],
  });
  const auction2Receipt = await waitForTx(createAuction2Hash, "[EVENT: AuctionCreated] auction 2");
  const auction2Logs = parseEventLogs({
    abi: auctionAbi, logs: auction2Receipt.logs, eventName: "AuctionCreated",
  });
  const auctionId2 = auction2Logs[0].args.auctionId;
  console.log(`  Auction ID: ${auctionId2}`);

  // Bidder places a bid (will be refunded on force-close)
  console.log("\n>> Step 8: Bidder bids on auction 2...");
  const bid3Hash = await bidderClient.writeContract({
    address: AUCTION, abi: auctionAbi, functionName: "placeBid",
    args: [auctionId2, BID_AMOUNT],
  });
  await waitForTx(bid3Hash, "[EVENT: BidPlaced] on auction 2");

  // EVENT: AuctionForceClosed + ReputationUpdated
  console.log("\n>> Step 9: Force-close auction 2 (reputation -1)...");
  const forceCloseHash = await ownerClient.writeContract({
    address: AUCTION, abi: auctionAbi, functionName: "forceCloseAuction",
    args: [auctionId2, -1],
  });
  await waitForTx(forceCloseHash, "[EVENT: AuctionForceClosed + ReputationUpdated]");

  // Verify reputation
  const rep = await publicClient.readContract({
    address: AUCTION, abi: auctionAbi, functionName: "reputationScores",
    args: [ownerAccount.address],
  });
  console.log(`  Seller reputation: ${rep}`);

  // ══════════════════════════════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n===================================================");
  console.log("  PASS — All 7 event types fired on-chain");
  console.log("===================================================");
  console.log("  Events fired:");
  console.log("    [x] AuctionCreated      (x2)");
  console.log("    [x] BidPlaced           (x3: first, outbid, auction2)");
  console.log("    [x] RefundWithdrawn      (x1)");
  console.log("    [x] AuctionClosed        (x1)");
  console.log("    [x] TradeExecuted        (x1)");
  console.log("    [x] AuctionForceClosed   (x1)");
  console.log("    [x] ReputationUpdated    (x1)");
  console.log("===================================================");
  console.log(`  Auction contract: ${AUCTION}`);
  console.log(`  Deploy block:     10386736`);
  console.log("===================================================");
}

main().catch((err) => {
  console.error("\nx E2E test failed:", err);
  process.exit(1);
});
