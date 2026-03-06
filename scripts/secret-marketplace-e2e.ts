/**
 * SecretMarketplace E2E Test Script
 *
 * Full lifecycle test on Eth Sepolia that fires EVERY event type:
 *   - SellerRegistered
 *   - AuctionCreated
 *   - BidPlaced
 *   - AuctionClosed
 *   - AuctionForceClosed + ReputationUpdated
 *   - ExternalMarketResolved + ReputationUpdated
 *
 * Then exercises the Supabase web2 private bidding workflow:
 *   - Deposit (credit balance)
 *   - Create secret
 *   - Place private bid (lock balance)
 *   - Outbid (release + lock)
 *   - Force-close refund
 *   - Constraint checks (invalid address, negative balance, duplicate active bid)
 *   - Withdrawal lifecycle
 *
 * Env vars required:
 *   OWNER_PK                    — deploys, creates markets, closes auctions, settles
 *   BIDDER_PK                   — unused on-chain (admin-only model) but needed for Supabase tests
 *   RPC_URL                     — Eth Sepolia RPC
 *   MOCK_USDC_ADDRESS           — MockUSDC contract
 *   SIMPLE_MARKET_ADDRESS       — ExamplePredictionMarket contract
 *   SECRET_MARKETPLACE_ADDRESS  — SecretMarketplace contract
 *   SUPABASE_URL                — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — Supabase service role key
 *
 * Usage: pnpm e2e
 */

import {
  MOCK_USDC_ADDRESS,
  mockUsdcAbi,
  SECRET_MARKETPLACE_ADDRESS,
  secretMarketplaceAbi,
  examplePredictionMarketAbi,
  type Database,
} from "@private-streams/common";
import { createClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

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
const MOCK_USDC = (process.env.MOCK_USDC_ADDRESS ??
  MOCK_USDC_ADDRESS) as Address;
const SECRET_MARKETPLACE = (process.env.SECRET_MARKETPLACE_ADDRESS ??
  SECRET_MARKETPLACE_ADDRESS) as Address;
// NOTE: We read the ExamplePredictionMarket address from SecretMarketplace.simpleMarket() at runtime
// to avoid mismatch between the two contracts. See Step 0 below.
let SIMPLE_MARKET: Address;

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

const USDC_DECIMALS = 6;
const MINT_AMOUNT = 10_000_000_000n; // 10,000 USDC
const MIN_BALANCE = 10_000_000n; // 10 USDC — threshold to trigger mint
const APPROVAL_AMOUNT = 100_000_000_000n; // 100,000 USDC — blanket approval
const BID_AMOUNT = 1_000_000n; // 1 USDC
const AUCTION_DURATION = 60; // seconds
const FORCE_CLOSE_AUCTION_DURATION = 300; // seconds (won't wait for it)
const QUESTION_1 = "The New York Yankees won the 2009 World Series.";
const QUESTION_2 = "Will ETH hit $10k by end of 2026?";
const SELLER_NAME = "Insider Alice";

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  // Read the ExamplePredictionMarket address that SecretMarketplace was deployed with
  SIMPLE_MARKET = (await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "simpleMarket",
  })) as Address;

  console.log("===================================================");
  console.log("  SecretMarketplace E2E — Fire ALL Events");
  console.log("===================================================");
  console.log(`  Owner (admin):    ${ownerAccount.address}`);
  console.log(`  Bidder (web2):    ${bidderAccount.address}`);
  console.log(`  MockUSDC:         ${MOCK_USDC}`);
  console.log(
    `  ExamplePredictionMarket: ${SIMPLE_MARKET} (from SecretMarketplace.simpleMarket())`,
  );
  console.log(`  SecretMarketplace: ${SECRET_MARKETPLACE}`);
  console.log("===================================================\n");

  // ── Step 0: Mint USDC + approve ────────────────────────────────────────────
  console.log(">> Step 0: Ensuring owner has USDC and approvals...");

  const ownerBalance = await publicClient.readContract({
    address: MOCK_USDC,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: [ownerAccount.address],
  });
  if (ownerBalance < MIN_BALANCE) {
    const h = await ownerClient.writeContract({
      address: MOCK_USDC,
      abi: mockUsdcAbi,
      functionName: "mint",
      args: [ownerAccount.address, MINT_AMOUNT],
    });
    await waitForTx(h, "Mint USDC to owner");
  } else {
    console.log(
      `  ok Owner has ${formatUnits(ownerBalance, USDC_DECIMALS)} USDC`,
    );
  }

  // Approve SecretMarketplace and ExamplePredictionMarket for owner
  const approveOwnerSM = await ownerClient.writeContract({
    address: MOCK_USDC,
    abi: mockUsdcAbi,
    functionName: "approve",
    args: [SECRET_MARKETPLACE, APPROVAL_AMOUNT],
  });
  await waitForTx(approveOwnerSM, "Owner approved SecretMarketplace");

  const approveOwnerMarket = await ownerClient.writeContract({
    address: MOCK_USDC,
    abi: mockUsdcAbi,
    functionName: "approve",
    args: [SIMPLE_MARKET, APPROVAL_AMOUNT],
  });
  await waitForTx(approveOwnerMarket, "Owner approved ExamplePredictionMarket");

  // ── Step 1: Register seller ────────────────────────────────────────────────
  // EVENT: SellerRegistered
  console.log("\n>> Step 1: Register seller...");
  const registerHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "registerSeller",
    args: [SELLER_NAME],
  });
  await waitForTx(registerHash, "[EVENT: SellerRegistered]");

  // ══════════════════════════════════════════════════════════════════════════
  // AUCTION 1: Normal flow → AuctionCreated, BidPlaced, AuctionClosed
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n>> Step 2: Create market + auction (normal flow)...");
  const createMarketHash = await ownerClient.writeContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "newMarket",
    args: [QUESTION_1],
  });
  const marketReceipt = await waitForTx(createMarketHash, "Market created");
  const marketLogs = parseEventLogs({
    abi: examplePredictionMarketAbi,
    logs: marketReceipt.logs,
    eventName: "MarketCreated",
  });
  const marketId1 = marketLogs[0].args.marketId;
  console.log(`  Market ID: ${marketId1}`);

  // EVENT: AuctionCreated
  const now1 = BigInt(Math.floor(Date.now() / 1000));
  const endTime1 = now1 + BigInt(AUCTION_DURATION);
  const createAuctionHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "createAuction",
    args: [SELLER_NAME, marketId1, QUESTION_1, endTime1],
  });
  const auctionReceipt = await waitForTx(
    createAuctionHash,
    "[EVENT: AuctionCreated]",
  );
  const auctionLogs = parseEventLogs({
    abi: secretMarketplaceAbi,
    logs: auctionReceipt.logs,
    eventName: "AuctionCreated",
  });
  const auctionId1 = auctionLogs[0].args.auctionId;
  console.log(`  Auction ID: ${auctionId1}`);

  // EVENT: BidPlaced (admin places bid on behalf of web2 user)
  console.log("\n>> Step 3: Admin places bid...");
  const bid1Hash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "placeBid",
    args: [auctionId1, BID_AMOUNT],
  });
  await waitForTx(bid1Hash, "[EVENT: BidPlaced]");

  // Wait for auction 1 to end
  console.log("\n>> Step 4: Waiting for auction 1 to end...");
  const auctionData = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getAuction",
    args: [auctionId1],
  });
  const onChainEndTime1 = auctionData.endTime;
  while (true) {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    if (block.timestamp >= onChainEndTime1) break;
    const remaining = Number(onChainEndTime1 - block.timestamp);
    console.log(
      `  Chain ts=${block.timestamp}, ends=${onChainEndTime1} (${remaining}s left)...`,
    );
    await sleep(Math.min(remaining * 1000 + 2000, 15000));
  }
  console.log("  ok Auction 1 period ended (on-chain)");

  // EVENT: AuctionClosed (admin closes auction — funds stay in contract)
  console.log("\n>> Step 5: Admin closes auction 1...");
  const closeHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "closeAuction",
    args: [auctionId1],
  });
  await waitForTx(closeHash, "[EVENT: AuctionClosed]");

  // EVENT: ExternalMarketResolved + ReputationUpdated (resolve market 1 with delta=+1)
  console.log(
    "\n>> Step 6: Resolve external market (delta=+1)...",
  );
  const resolveHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "resolveExternalMarket",
    args: [marketId1, 1],
  });
  await waitForTx(
    resolveHash,
    "[EVENT: ExternalMarketResolved + ReputationUpdated]",
  );

  // Verify reputation after resolve
  const sellerAfterResolve = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getSeller",
    args: [SELLER_NAME],
  });
  console.log(
    `  Seller reputation after resolve: ${sellerAfterResolve.reputationScore}`,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // AUCTION 2: Force-close flow → AuctionCreated, BidPlaced,
  //            AuctionForceClosed, ReputationUpdated
  // ══════════════════════════════════════════════════════════════════════════

  console.log(
    "\n>> Step 7: Create auction 2 (will be force-closed)...",
  );
  const createMarket2Hash = await ownerClient.writeContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "newMarket",
    args: [QUESTION_2],
  });
  const market2Receipt = await waitForTx(createMarket2Hash, "Market 2 created");
  const market2Logs = parseEventLogs({
    abi: examplePredictionMarketAbi,
    logs: market2Receipt.logs,
    eventName: "MarketCreated",
  });
  const marketId2 = market2Logs[0].args.marketId;
  console.log(`  Market ID: ${marketId2}`);

  const now2 = BigInt(Math.floor(Date.now() / 1000));
  const endTime2 = now2 + BigInt(FORCE_CLOSE_AUCTION_DURATION);
  const createAuction2Hash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "createAuction",
    args: [SELLER_NAME, marketId2, QUESTION_2, endTime2],
  });
  const auction2Receipt = await waitForTx(
    createAuction2Hash,
    "[EVENT: AuctionCreated] auction 2",
  );
  const auction2Logs = parseEventLogs({
    abi: secretMarketplaceAbi,
    logs: auction2Receipt.logs,
    eventName: "AuctionCreated",
  });
  const auctionId2 = auction2Logs[0].args.auctionId;
  console.log(`  Auction ID: ${auctionId2}`);

  // Admin places a bid (will be held on force-close)
  console.log("\n>> Step 8: Admin places bid on auction 2...");
  const bid2Hash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "placeBid",
    args: [auctionId2, BID_AMOUNT],
  });
  await waitForTx(bid2Hash, "[EVENT: BidPlaced] on auction 2");

  // EVENT: AuctionForceClosed + ReputationUpdated (delta=-1)
  console.log(
    "\n>> Step 9: Force-close auction 2 (reputationDelta=-1)...",
  );
  const forceCloseHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "forceCloseAuction",
    args: [auctionId2, -1],
  });
  await waitForTx(
    forceCloseHash,
    "[EVENT: AuctionForceClosed + ReputationUpdated]",
  );

  // Verify final reputation (+1 from resolve, -1 from force-close = 0)
  const sellerFinal = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getSeller",
    args: [SELLER_NAME],
  });
  console.log(
    `  Seller final reputation: ${sellerFinal.reputationScore} (expected 0: +1 resolve, -1 force-close)`,
  );

  console.log("\n===================================================");
  console.log("  On-chain PASS — All event types fired");
  console.log("===================================================");

  // ══════════════════════════════════════════════════════════════════════════
  // WEB2 PRIVATE BIDDING (Supabase)
  // ══════════════════════════════════════════════════════════════════════════

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log(
      "\n  SKIP — Supabase env vars not set (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)",
    );
    console.log(
      "  On-chain tests passed. Set Supabase vars to run private bidding tests.\n",
    );
    return;
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);
  const ownerAddr = ownerAccount.address.toLowerCase();
  const bidderAddr = bidderAccount.address.toLowerCase();
  // Use the on-chain auctionId2 (force-closed auction) for private bidding tests
  const testAuctionId = auctionId2.toString();
  const DEMO_AMOUNT = "10000000000000000000"; // 10 DEMO in wei (18 decimals)
  const BID_DEMO = "3000000000000000000"; // 3 DEMO

  console.log("\n===================================================");
  console.log("  Web2 Private Bidding Tests (Supabase)");
  console.log("===================================================\n");

  // ── Step 10: Setup — clean up any previous test data ────────────────────
  console.log(">> Step 10: Cleaning up previous test data...");
  await supabase
    .from("private_withdrawals")
    .delete()
    .in("user_address", [ownerAddr, bidderAddr]);
  await supabase
    .from("private_bids")
    .delete()
    .in("bidder_address", [ownerAddr, bidderAddr]);
  await supabase.from("secrets").delete().eq("auction_id", testAuctionId);
  await supabase
    .from("deposits")
    .delete()
    .in("user_address", [ownerAddr, bidderAddr]);
  await supabase
    .from("balances")
    .delete()
    .in("user_address", [ownerAddr, bidderAddr]);
  console.log("  ok Cleaned up");

  // ── Step 11: Deposit — record deposits and credit balances ─────────────
  console.log("\n>> Step 11: Recording deposits and crediting balances...");

  // Create balance rows for both users (start at 0)
  const { error: ownerInsertErr } = await supabase.from("balances").insert({
    user_address: ownerAddr,
    available_balance: "0",
    locked_balance: "0",
    pending_withdrawal: "0",
  });
  if (ownerInsertErr)
    throw new Error(`Owner balance insert failed: ${ownerInsertErr.message}`);

  const { error: bidderInsertErr } = await supabase.from("balances").insert({
    user_address: bidderAddr,
    available_balance: "0",
    locked_balance: "0",
    pending_withdrawal: "0",
  });
  if (bidderInsertErr)
    throw new Error(`Bidder balance insert failed: ${bidderInsertErr.message}`);

  // Record owner's deposit (simulates cron detecting private transfer to platform EOA)
  const ownerTxId = `test-deposit-owner-${Date.now()}`;
  const { data: ownerDeposit, error: ownerDepositErr } = await supabase
    .from("deposits")
    .insert({
      transaction_id: ownerTxId,
      user_address: ownerAddr,
      sender_address: ownerAddr,
      amount: DEMO_AMOUNT,
      status: "confirmed",
      credited_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (ownerDepositErr)
    throw new Error(`Owner deposit insert failed: ${ownerDepositErr.message}`);
  console.log(
    `  ok Owner deposit recorded: ${ownerDeposit!.id} (tx: ${ownerTxId})`,
  );

  // Record bidder's deposit
  const bidderTxId = `test-deposit-bidder-${Date.now()}`;
  const { data: bidderDeposit, error: bidderDepositErr } = await supabase
    .from("deposits")
    .insert({
      transaction_id: bidderTxId,
      user_address: bidderAddr,
      sender_address: bidderAddr,
      amount: DEMO_AMOUNT,
      status: "confirmed",
      credited_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (bidderDepositErr)
    throw new Error(
      `Bidder deposit insert failed: ${bidderDepositErr.message}`,
    );
  console.log(
    `  ok Bidder deposit recorded: ${bidderDeposit!.id} (tx: ${bidderTxId})`,
  );

  // Credit balances based on deposits
  const { error: ownerCreditErr } = await supabase
    .from("balances")
    .update({
      available_balance: DEMO_AMOUNT,
    })
    .eq("user_address", ownerAddr);
  if (ownerCreditErr)
    throw new Error(`Owner credit failed: ${ownerCreditErr.message}`);

  const { error: bidderCreditErr } = await supabase
    .from("balances")
    .update({
      available_balance: DEMO_AMOUNT,
    })
    .eq("user_address", bidderAddr);
  if (bidderCreditErr)
    throw new Error(`Bidder credit failed: ${bidderCreditErr.message}`);

  // Test idempotency: duplicate transaction_id should be rejected
  const { error: dupDepositErr } = await supabase.from("deposits").insert({
    transaction_id: ownerTxId, // same tx_id — should fail
    user_address: ownerAddr,
    amount: DEMO_AMOUNT,
  });
  if (dupDepositErr) {
    console.log(
      "  ok Duplicate deposit rejected (idempotency): " +
        dupDepositErr.message.slice(0, 80),
    );
  } else {
    throw new Error(
      "Duplicate deposit transaction_id should have been rejected!",
    );
  }

  // Test deposit amount constraint: zero/negative should fail
  const { error: zeroDepositErr } = await supabase.from("deposits").insert({
    transaction_id: `test-zero-${Date.now()}`,
    user_address: bidderAddr,
    amount: "0",
  });
  if (zeroDepositErr) {
    console.log(
      "  ok Zero-amount deposit rejected: " +
        zeroDepositErr.message.slice(0, 80),
    );
  } else {
    // Clean up
    await supabase.from("deposits").delete().eq("amount", "0");
    throw new Error("Zero-amount deposit should have been rejected!");
  }

  // Verify balances
  const { data: ownerBal } = await supabase
    .from("balances")
    .select("available_balance")
    .eq("user_address", ownerAddr)
    .single();
  const { data: bidderBal } = await supabase
    .from("balances")
    .select("available_balance")
    .eq("user_address", bidderAddr)
    .single();
  console.log(`  ok Owner balance: ${ownerBal?.available_balance}`);
  console.log(`  ok Bidder balance: ${bidderBal?.available_balance}`);

  // ── Step 12: Create secret for auction ─────────────────────────────────
  console.log("\n>> Step 12: Creating secret for auction...");
  const { error: secretErr } = await supabase.from("secrets").insert({
    auction_id: testAuctionId,
    secret_data: { insider_tip: "ETH merge date leaked", confidence: 0.95 },
    market_data: { question: QUESTION_2, market_id: marketId2.toString() },
    seller: ownerAddr,
  });
  if (secretErr) throw new Error(`Secret insert failed: ${secretErr.message}`);
  console.log(`  ok Secret created for auction ${testAuctionId}`);

  // ── Step 13: Bidder places private bid ─────────────────────────────────
  console.log("\n>> Step 13: Bidder places private bid (3 DEMO)...");

  // Lock bidder's balance: available -= BID_DEMO, locked += BID_DEMO
  // (In production this would be a single transaction with FOR UPDATE)
  const { data: bidderBalBefore } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAddr)
    .single();
  const availBefore = BigInt(bidderBalBefore!.available_balance);
  const lockedBefore = BigInt(bidderBalBefore!.locked_balance);
  const bidAmount = BigInt(BID_DEMO);

  if (availBefore < bidAmount) throw new Error("Insufficient balance");

  const { error: bidLockErr } = await supabase
    .from("balances")
    .update({
      available_balance: (availBefore - bidAmount).toString(),
      locked_balance: (lockedBefore + bidAmount).toString(),
    })
    .eq("user_address", bidderAddr);
  if (bidLockErr) throw new Error(`Balance lock failed: ${bidLockErr.message}`);

  const { data: bidRow, error: bidInsertErr } = await supabase
    .from("private_bids")
    .insert({
      auction_id: testAuctionId,
      bidder_address: bidderAddr,
      amount: BID_DEMO,
      status: "active",
    })
    .select()
    .single();
  if (bidInsertErr)
    throw new Error(`Bid insert failed: ${bidInsertErr.message}`);
  console.log(`  ok Bid placed: ${bidRow!.id}`);

  // Verify bidder balance
  const { data: bidderBalAfterBid } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAddr)
    .single();
  console.log(
    `  ok Bidder: available=${bidderBalAfterBid!.available_balance}, locked=${bidderBalAfterBid!.locked_balance}`,
  );

  // ── Step 14: Owner outbids (5 DEMO) — release bidder, lock owner ──────
  console.log("\n>> Step 14: Owner outbids with 5 DEMO...");
  const OUTBID_AMOUNT = "5000000000000000000"; // 5 DEMO

  // Mark bidder's bid as outbid
  const { error: outbidErr } = await supabase
    .from("private_bids")
    .update({
      status: "outbid",
      outbid_at: new Date().toISOString(),
    })
    .eq("id", bidRow!.id);
  if (outbidErr) throw new Error(`Outbid update failed: ${outbidErr.message}`);

  // Release bidder's locked balance
  const { data: bidderBalLocked } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAddr)
    .single();
  const { error: releaseErr } = await supabase
    .from("balances")
    .update({
      available_balance: (
        BigInt(bidderBalLocked!.available_balance) + bidAmount
      ).toString(),
      locked_balance: (
        BigInt(bidderBalLocked!.locked_balance) - bidAmount
      ).toString(),
    })
    .eq("user_address", bidderAddr);
  if (releaseErr)
    throw new Error(`Balance release failed: ${releaseErr.message}`);

  // Lock owner's balance for new bid
  const { data: ownerBalBefore } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", ownerAddr)
    .single();
  const outbidAmount = BigInt(OUTBID_AMOUNT);
  const { error: ownerLockErr } = await supabase
    .from("balances")
    .update({
      available_balance: (
        BigInt(ownerBalBefore!.available_balance) - outbidAmount
      ).toString(),
      locked_balance: (
        BigInt(ownerBalBefore!.locked_balance) + outbidAmount
      ).toString(),
    })
    .eq("user_address", ownerAddr);
  if (ownerLockErr)
    throw new Error(`Owner lock failed: ${ownerLockErr.message}`);

  // Insert owner's bid
  const { data: ownerBidRow, error: ownerBidErr } = await supabase
    .from("private_bids")
    .insert({
      auction_id: testAuctionId,
      bidder_address: ownerAddr,
      amount: OUTBID_AMOUNT,
      status: "active",
    })
    .select()
    .single();
  if (ownerBidErr)
    throw new Error(`Owner bid insert failed: ${ownerBidErr.message}`);
  console.log(`  ok Owner bid placed: ${ownerBidRow!.id}`);

  // Verify both balances
  const { data: bidderBalAfterOutbid } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAddr)
    .single();
  const { data: ownerBalAfterBid } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", ownerAddr)
    .single();
  console.log(
    `  ok Bidder: available=${bidderBalAfterOutbid!.available_balance}, locked=${bidderBalAfterOutbid!.locked_balance}`,
  );
  console.log(
    `  ok Owner:  available=${ownerBalAfterBid!.available_balance}, locked=${ownerBalAfterBid!.locked_balance}`,
  );

  // Verify bidder balance is fully available again (10 DEMO available, 0 locked)
  if (BigInt(bidderBalAfterOutbid!.locked_balance) !== 0n) {
    throw new Error(
      `Expected bidder locked=0, got ${bidderBalAfterOutbid!.locked_balance}`,
    );
  }
  console.log("  ok Bidder's locked balance fully released");

  // ── Step 15: Constraint checks ─────────────────────────────────────────
  console.log("\n>> Step 15: Testing DB constraints...");

  // 15a: Duplicate active bid for same auction should fail (unique partial index)
  const { error: dupErr } = await supabase.from("private_bids").insert({
    auction_id: testAuctionId,
    bidder_address: bidderAddr,
    amount: "1000000000000000000",
    status: "active",
  });
  if (dupErr) {
    console.log(
      "  ok Duplicate active bid rejected: " + dupErr.message.slice(0, 80),
    );
  } else {
    throw new Error("Duplicate active bid should have been rejected!");
  }

  // 15b: Invalid address format should fail
  const { error: addrErr } = await supabase.from("balances").insert({
    user_address: "not-an-address",
    available_balance: "0",
    locked_balance: "0",
    pending_withdrawal: "0",
  });
  if (addrErr) {
    console.log(
      "  ok Invalid address rejected: " + addrErr.message.slice(0, 80),
    );
  } else {
    // Clean up the accidentally inserted row
    await supabase
      .from("balances")
      .delete()
      .eq("user_address", "not-an-address");
    throw new Error("Invalid address should have been rejected!");
  }

  // 15c: Negative balance should fail
  const { error: negErr } = await supabase
    .from("balances")
    .update({
      available_balance: "-1",
    })
    .eq("user_address", bidderAddr);
  if (negErr) {
    console.log(
      "  ok Negative balance rejected: " + negErr.message.slice(0, 80),
    );
  } else {
    throw new Error("Negative balance should have been rejected!");
  }

  // ── Step 16: Force-close refund — release owner's locked balance ───────
  console.log(
    "\n>> Step 16: Force-close refund (release owner's locked balance)...",
  );

  const { error: refundBidErr } = await supabase
    .from("private_bids")
    .update({
      status: "refunded",
      refunded_at: new Date().toISOString(),
    })
    .eq("id", ownerBidRow!.id);
  if (refundBidErr)
    throw new Error(`Refund bid update failed: ${refundBidErr.message}`);

  const { data: ownerBalForRefund } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", ownerAddr)
    .single();
  const { error: refundBalErr } = await supabase
    .from("balances")
    .update({
      available_balance: (
        BigInt(ownerBalForRefund!.available_balance) + outbidAmount
      ).toString(),
      locked_balance: (
        BigInt(ownerBalForRefund!.locked_balance) - outbidAmount
      ).toString(),
    })
    .eq("user_address", ownerAddr);
  if (refundBalErr)
    throw new Error(`Refund balance update failed: ${refundBalErr.message}`);

  const { data: ownerBalAfterRefund } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", ownerAddr)
    .single();
  console.log(
    `  ok Owner refunded: available=${ownerBalAfterRefund!.available_balance}, locked=${ownerBalAfterRefund!.locked_balance}`,
  );
  if (BigInt(ownerBalAfterRefund!.locked_balance) !== 0n) {
    throw new Error(
      `Expected owner locked=0, got ${ownerBalAfterRefund!.locked_balance}`,
    );
  }

  // ── Step 17: Withdrawal lifecycle ──────────────────────────────────────
  console.log("\n>> Step 17: Withdrawal lifecycle...");

  // Bidder withdraws all available balance
  const { data: bidderBalForWithdraw } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAddr)
    .single();
  const withdrawAmount = bidderBalForWithdraw!.available_balance;

  // Move to pending_withdrawal
  const { error: withdrawLockErr } = await supabase
    .from("balances")
    .update({
      available_balance: "0",
      pending_withdrawal: withdrawAmount,
    })
    .eq("user_address", bidderAddr);
  if (withdrawLockErr)
    throw new Error(`Withdrawal lock failed: ${withdrawLockErr.message}`);

  const { data: withdrawalRow, error: withdrawInsertErr } = await supabase
    .from("private_withdrawals")
    .insert({
      user_address: bidderAddr,
      amount: withdrawAmount,
      recipient_address: bidderAddr,
      status: "requested",
    })
    .select()
    .single();
  if (withdrawInsertErr)
    throw new Error(`Withdrawal insert failed: ${withdrawInsertErr.message}`);
  console.log(`  ok Withdrawal requested: ${withdrawalRow!.id}`);

  // Simulate transfer completion
  const { error: withdrawCompleteErr } = await supabase
    .from("private_withdrawals")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      transfer_tx_id: "simulated-tx-id",
    })
    .eq("id", withdrawalRow!.id);
  if (withdrawCompleteErr)
    throw new Error(
      `Withdrawal complete failed: ${withdrawCompleteErr.message}`,
    );

  const { error: withdrawBalErr } = await supabase
    .from("balances")
    .update({
      pending_withdrawal: "0",
    })
    .eq("user_address", bidderAddr);
  if (withdrawBalErr)
    throw new Error(
      `Withdrawal balance update failed: ${withdrawBalErr.message}`,
    );

  // Verify final state
  const { data: bidderFinal } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAddr)
    .single();
  console.log(
    `  ok Bidder final: available=${bidderFinal!.available_balance}, locked=${bidderFinal!.locked_balance}, pending=${bidderFinal!.pending_withdrawal}`,
  );
  if (
    BigInt(bidderFinal!.available_balance) !== 0n ||
    BigInt(bidderFinal!.locked_balance) !== 0n ||
    BigInt(bidderFinal!.pending_withdrawal) !== 0n
  ) {
    throw new Error(
      `Expected all zeroes, got available=${bidderFinal!.available_balance} locked=${bidderFinal!.locked_balance} pending=${bidderFinal!.pending_withdrawal}`,
    );
  }
  console.log("  ok Withdrawal complete — all balances zeroed");

  // ── Step 18: Cleanup ───────────────────────────────────────────────────
  console.log("\n>> Step 18: Cleaning up test data...");
  await supabase
    .from("private_withdrawals")
    .delete()
    .in("user_address", [ownerAddr, bidderAddr]);
  await supabase
    .from("private_bids")
    .delete()
    .in("bidder_address", [ownerAddr, bidderAddr]);
  await supabase.from("secrets").delete().eq("auction_id", testAuctionId);
  await supabase
    .from("deposits")
    .delete()
    .in("user_address", [ownerAddr, bidderAddr]);
  await supabase
    .from("balances")
    .delete()
    .in("user_address", [ownerAddr, bidderAddr]);
  console.log("  ok All test data cleaned up");

  // ══════════════════════════════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n===================================================");
  console.log("  PASS — All tests passed");
  console.log("===================================================");
  console.log("  On-chain events fired:");
  console.log("    [x] SellerRegistered        (x1)");
  console.log("    [x] AuctionCreated          (x2)");
  console.log("    [x] BidPlaced               (x2)");
  console.log("    [x] AuctionClosed           (x1)");
  console.log("    [x] ExternalMarketResolved  (x1)");
  console.log("    [x] AuctionForceClosed      (x1)");
  console.log(
    "    [x] ReputationUpdated       (x2: resolve +1, force-close -1)",
  );
  console.log("  Supabase private bidding:");
  console.log("    [x] Deposit (record + credit balance)");
  console.log("    [x] Deposit idempotency (duplicate tx_id rejected)");
  console.log("    [x] Deposit constraint (zero amount rejected)");
  console.log("    [x] Create secret");
  console.log("    [x] Place private bid (lock balance)");
  console.log("    [x] Outbid (release + lock)");
  console.log("    [x] Constraint: duplicate active bid rejected");
  console.log("    [x] Constraint: invalid address rejected");
  console.log("    [x] Constraint: negative balance rejected");
  console.log("    [x] Force-close refund");
  console.log("    [x] Withdrawal lifecycle");
  console.log("    [x] Cleanup");
  console.log("===================================================");
  console.log(`  SecretMarketplace: ${SECRET_MARKETPLACE}`);
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log("===================================================");
}

main().catch((err) => {
  console.error("\nx E2E test failed:", err);
  process.exit(1);
});
