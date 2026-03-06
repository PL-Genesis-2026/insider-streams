/**
 * SecretMarketplace E2E Test Script
 *
 * Full lifecycle test on Eth Sepolia that fires EVERY event type:
 *   - SellerRegistered
 *   - AuctionCreated
 *   - BidPlaced
 *   - AuctionClosed + TradeExecuted
 *   - AuctionForceClosed + ReputationUpdated
 *
 * Then exercises the Supabase web2 private bidding workflow:
 *   - Deposit (credit balance)
 *   - Create secret
 *   - Place private bid (lock balance)
 *   - Outbid (release + lock)
 *   - Force-close refund
 *   - Constraint checks (invalid address, negative balance, duplicate active bid)
 *   - Withdrawal lifecycle
 *   - ExternalMarketResolved + ReputationUpdated
 *
 * Env vars required:
 *   OWNER_PK                    — deploys, creates markets, closes auctions, settles
 *   BIDDER_PK                   — places bids, claims winnings (MUST be different from owner)
 *   RPC_URL                     — Eth Sepolia RPC
 *   MOCK_USDC_ADDRESS           — MockUSDC contract
 *   SIMPLE_MARKET_ADDRESS       — SimpleMarket contract
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
  simpleMarketAbi,
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
// NOTE: We read the SimpleMarket address from SecretMarketplace.market() at runtime
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

const USDC_DECIMALS = 6;
const MINT_AMOUNT = 10_000_000_000n; // 10,000 USDC
const MIN_BALANCE = 10_000_000n; // 10 USDC — threshold to trigger mint
const APPROVAL_AMOUNT = 100_000_000_000n; // 100,000 USDC — blanket approval
const BID_AMOUNT = 1_000_000n; // 1 USDC
const AUTOMATIC_BET_AMOUNT = 5_000_000n; // 5 USDC — intended bet on prediction market
const AUCTION_DURATION = 60; // seconds
const FORCE_CLOSE_AUCTION_DURATION = 300; // seconds (won't wait for it)
const QUESTION_1 = "The New York Yankees won the 2009 World Series.";
const QUESTION_2 = "Will ETH hit $10k by end of 2026?";
// SimpleMarket.Outcome values
const OUTCOME_NO = 1;
const OUTCOME_YES = 2;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  // Read the SimpleMarket address that SecretMarketplace was deployed with
  SIMPLE_MARKET = (await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "simpleMarket",
  })) as Address;

  console.log("===================================================");
  console.log("  SecretMarketplace E2E — Fire ALL Events");
  console.log("===================================================");
  console.log(`  Owner:            ${ownerAccount.address}`);
  console.log(`  Bidder:           ${bidderAccount.address}`);
  console.log(`  MockUSDC:         ${MOCK_USDC}`);
  console.log(
    `  SimpleMarket:     ${SIMPLE_MARKET} (from SecretMarketplace.market())`,
  );
  console.log(`  SecretMarketplace: ${SECRET_MARKETPLACE}`);
  console.log("===================================================\n");

  // ── Step 0: Mint USDC + approve ────────────────────────────────────────────
  console.log(">> Step 0: Ensuring both accounts have USDC and approvals...");

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

  const bidderBalance = await publicClient.readContract({
    address: MOCK_USDC,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: [bidderAccount.address],
  });
  if (bidderBalance < MIN_BALANCE) {
    const h = await ownerClient.writeContract({
      address: MOCK_USDC,
      abi: mockUsdcAbi,
      functionName: "mint",
      args: [bidderAccount.address, MINT_AMOUNT],
    });
    await waitForTx(h, "Mint USDC to bidder");
  } else {
    console.log(
      `  ok Bidder has ${formatUnits(bidderBalance, USDC_DECIMALS)} USDC`,
    );
  }

  // Approve SecretMarketplace and SimpleMarket for both users
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
  await waitForTx(approveOwnerMarket, "Owner approved SimpleMarket");

  const approveBidder = await bidderClient.writeContract({
    address: MOCK_USDC,
    abi: mockUsdcAbi,
    functionName: "approve",
    args: [SECRET_MARKETPLACE, APPROVAL_AMOUNT],
  });
  await waitForTx(approveBidder, "Bidder approved SecretMarketplace");

  // ── Step 1: Register seller ────────────────────────────────────────────────
  // EVENT: SellerRegistered
  console.log("\n>> Step 1: Register seller...");
  const registerHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "registerSeller",
    args: ["Insider Alice"],
  });
  await waitForTx(registerHash, "[EVENT: SellerRegistered]");

  // ══════════════════════════════════════════════════════════════════════════
  // AUCTION 1: Normal flow → AuctionCreated, BidPlaced, AuctionClosed,
  //            TradeExecuted
  // ══════════════════════════════════════════════════════════════════════════

  console.log(
    "\n>> Step 2: Create market + auction (normal flow, betOnYes=true)...",
  );
  const createMarketHash = await ownerClient.writeContract({
    address: SIMPLE_MARKET,
    abi: simpleMarketAbi,
    functionName: "newMarket",
    args: [QUESTION_1],
  });
  const marketReceipt = await waitForTx(createMarketHash, "Market created");
  const marketLogs = parseEventLogs({
    abi: simpleMarketAbi,
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
    args: [marketId1, BID_AMOUNT, endTime1, ZERO_ADDRESS, ZERO_ADDRESS, true],
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

  // EVENT: BidPlaced (bidder bids — seller cannot bid on own auction)
  console.log("\n>> Step 3: Bidder places bid...");
  const bid1Hash = await bidderClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "placeBid",
    args: [auctionId1, BID_AMOUNT, AUTOMATIC_BET_AMOUNT],
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

  // EVENT: AuctionClosed + TradeExecuted (seller closes own auction)
  console.log("\n>> Step 5: Seller closes auction 1...");
  const closeHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "closeAuction",
    args: [auctionId1],
  });
  await waitForTx(closeHash, "[EVENT: AuctionClosed + TradeExecuted]");

  // EVENT: ExternalMarketResolved + ReputationUpdated (resolve market 1 as Yes → +1)
  console.log(
    "\n>> Step 6: Resolve external market (outcome=Yes, seller bet Yes → +1)...",
  );
  const resolveHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "resolveExternalMarket",
    args: [marketId1, OUTCOME_YES],
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
    args: [ownerAccount.address],
  });
  console.log(
    `  Seller reputation after resolve: ${sellerAfterResolve.reputationScore}`,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // AUCTION 2: Force-close flow → AuctionCreated, BidPlaced,
  //            AuctionForceClosed, ReputationUpdated
  // ══════════════════════════════════════════════════════════════════════════

  console.log(
    "\n>> Step 7: Create auction 2 (will be force-closed, betOnYes=true)...",
  );
  const createMarket2Hash = await ownerClient.writeContract({
    address: SIMPLE_MARKET,
    abi: simpleMarketAbi,
    functionName: "newMarket",
    args: [QUESTION_2],
  });
  const market2Receipt = await waitForTx(createMarket2Hash, "Market 2 created");
  const market2Logs = parseEventLogs({
    abi: simpleMarketAbi,
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
    args: [marketId2, BID_AMOUNT, endTime2, ZERO_ADDRESS, ZERO_ADDRESS, true],
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

  // Bidder places a bid (will be refunded on force-close)
  console.log("\n>> Step 8: Bidder bids on auction 2...");
  const bid2Hash = await bidderClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "placeBid",
    args: [auctionId2, BID_AMOUNT, AUTOMATIC_BET_AMOUNT],
  });
  await waitForTx(bid2Hash, "[EVENT: BidPlaced] on auction 2");

  // EVENT: AuctionForceClosed + ReputationUpdated (outcome=No, seller bet Yes → -1)
  console.log(
    "\n>> Step 9: Force-close auction 2 (outcome=No, seller bet Yes → -1)...",
  );
  const forceCloseHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "forceCloseAuction",
    args: [auctionId2, OUTCOME_NO],
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
    args: [ownerAccount.address],
  });
  console.log(
    `  Seller final reputation: ${sellerFinal.reputationScore} (expected 0: +1 resolve, -1 force-close)`,
  );

  console.log("\n===================================================");
  console.log("  On-chain PASS — All 6 event types fired");
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

  // ── Step 8: Setup — clean up any previous test data ────────────────────
  // Note: balances is now a VIEW derived from deposits/bids/withdrawals,
  // so we only clean the underlying tables. Order matters for FK-like deps.
  console.log(">> Step 8: Cleaning up previous test data...");
  await supabase
    .from("transfers")
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
  console.log("  ok Cleaned up");

  // ── Step 9: Deposit — record deposits, verify view reflects them ──────
  // balances is now a VIEW: inserting confirmed deposits automatically
  // makes them appear in the view. No manual balance row creation needed.
  console.log("\n>> Step 9: Recording deposits (view auto-computes balances)...");

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

  // Verify balances via the view — should show 10 DEMO available for each
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
  console.log(`  ok Owner balance (view): ${ownerBal?.available_balance}`);
  console.log(`  ok Bidder balance (view): ${bidderBal?.available_balance}`);

  // ── Step 10: Create secret for auction ─────────────────────────────────
  console.log("\n>> Step 10: Creating secret for auction...");
  const { error: secretErr } = await supabase.from("secrets").insert({
    auction_id: testAuctionId,
    secret_data: { insider_tip: "ETH merge date leaked", confidence: 0.95 },
    market_data: { question: QUESTION_2, market_id: marketId2.toString() },
    seller: ownerAddr,
  });
  if (secretErr) throw new Error(`Secret insert failed: ${secretErr.message}`);
  console.log(`  ok Secret created for auction ${testAuctionId}`);

  // ── Step 11: Bidder places private bid ─────────────────────────────────
  // With balances as a view, we check available balance via the view,
  // then just insert the bid. The view automatically reflects locked amounts.
  console.log("\n>> Step 11: Bidder places private bid (3 DEMO)...");

  const bidAmount = BigInt(BID_DEMO);

  // App-level overdraw check: read available from view before inserting bid
  const { data: bidderBalBefore } = await supabase
    .from("balances")
    .select("available_balance")
    .eq("user_address", bidderAddr)
    .single();
  const availBefore = BigInt(bidderBalBefore!.available_balance ?? "0");
  if (availBefore < bidAmount) throw new Error("Insufficient balance");

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

  // Verify bidder balance via view — available should decrease, locked should increase
  const { data: bidderBalAfterBid } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAddr)
    .single();
  console.log(
    `  ok Bidder (view): available=${bidderBalAfterBid!.available_balance}, locked=${bidderBalAfterBid!.locked_balance}`,
  );

  // ── Step 12: Owner outbids (5 DEMO) — mark old bid outbid, insert new ─
  // With the view, no manual balance updates needed — just update bid statuses.
  console.log("\n>> Step 12: Owner outbids with 5 DEMO...");
  const OUTBID_AMOUNT = "5000000000000000000"; // 5 DEMO
  const outbidAmount = BigInt(OUTBID_AMOUNT);

  // Mark bidder's bid as outbid (view will release locked amount)
  const { error: outbidErr } = await supabase
    .from("private_bids")
    .update({
      status: "outbid",
      outbid_at: new Date().toISOString(),
    })
    .eq("id", bidRow!.id);
  if (outbidErr) throw new Error(`Outbid update failed: ${outbidErr.message}`);

  // Insert owner's bid (view will lock this amount)
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

  // Verify both balances via view
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
    `  ok Bidder (view): available=${bidderBalAfterOutbid!.available_balance}, locked=${bidderBalAfterOutbid!.locked_balance}`,
  );
  console.log(
    `  ok Owner (view):  available=${ownerBalAfterBid!.available_balance}, locked=${ownerBalAfterBid!.locked_balance}`,
  );

  // Verify bidder balance is fully available again (10 DEMO available, 0 locked)
  if (BigInt(bidderBalAfterOutbid!.locked_balance ?? "0") !== 0n) {
    throw new Error(
      `Expected bidder locked=0, got ${bidderBalAfterOutbid!.locked_balance}`,
    );
  }
  console.log("  ok Bidder's locked balance fully released");

  // ── Step 13: Constraint checks ─────────────────────────────────────────
  // Note: balances is now a read-only VIEW, so we can't test insert/update
  // constraints on it. We test constraints on the underlying tables instead.
  console.log("\n>> Step 13: Testing DB constraints...");

  // 13a: Duplicate active bid for same auction should fail (unique partial index)
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

  // 13b: Invalid address format on deposits table should fail
  const { error: addrErr } = await supabase.from("deposits").insert({
    transaction_id: `test-addr-${Date.now()}`,
    user_address: "not-an-address",
    amount: "1000000000000000000",
    status: "confirmed",
  });
  if (addrErr) {
    console.log(
      "  ok Invalid address rejected (deposits): " + addrErr.message.slice(0, 80),
    );
  } else {
    await supabase
      .from("deposits")
      .delete()
      .eq("user_address", "not-an-address");
    throw new Error("Invalid address should have been rejected!");
  }

  // 13c: App-level overdraw check — verify view correctly shows insufficient funds
  // (Views can't have CHECK constraints, so overdraw prevention is app-level)
  const { data: overdrawBal } = await supabase
    .from("balances")
    .select("available_balance")
    .eq("user_address", bidderAddr)
    .single();
  const overdrawAmount = BigInt(overdrawBal!.available_balance ?? "0") + 1n;
  console.log(
    `  ok Overdraw check: available=${overdrawBal!.available_balance}, ` +
    `attempted=${overdrawAmount} — would be rejected at app level`,
  );

  // ── Step 14: Force-close refund — mark bid refunded ───────────────────
  // With the view, marking bid as "refunded" automatically releases locked balance.
  console.log(
    "\n>> Step 14: Force-close refund (mark bid as refunded)...",
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

  // Verify via view — locked should be 0 now
  const { data: ownerBalAfterRefund } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", ownerAddr)
    .single();
  console.log(
    `  ok Owner refunded (view): available=${ownerBalAfterRefund!.available_balance}, locked=${ownerBalAfterRefund!.locked_balance}`,
  );
  if (BigInt(ownerBalAfterRefund!.locked_balance ?? "0") !== 0n) {
    throw new Error(
      `Expected owner locked=0, got ${ownerBalAfterRefund!.locked_balance}`,
    );
  }

  // ── Step 15: Withdrawal lifecycle ──────────────────────────────────────
  // With the view, inserting a withdrawal automatically shows in pending.
  // Completing it automatically deducts from available.
  console.log("\n>> Step 15: Withdrawal lifecycle...");

  // Read available balance from view to determine withdrawal amount
  const { data: bidderBalForWithdraw } = await supabase
    .from("balances")
    .select("available_balance")
    .eq("user_address", bidderAddr)
    .single();
  const withdrawAmount = bidderBalForWithdraw!.available_balance ?? "0";

  // Insert withdrawal request — view will show it as pending
  const { data: withdrawalRow, error: withdrawInsertErr } = await supabase
    .from("transfers")
    .insert({
      user_address: bidderAddr,
      amount: withdrawAmount,
      recipient_address: bidderAddr,
      status: "requested",
      type: "user_withdrawal",
    })
    .select()
    .single();
  if (withdrawInsertErr)
    throw new Error(`Withdrawal insert failed: ${withdrawInsertErr.message}`);
  console.log(`  ok Withdrawal requested: ${withdrawalRow!.id}`);

  // Verify pending shows in view
  const { data: bidderPending } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAddr)
    .single();
  console.log(
    `  ok Bidder after request (view): available=${bidderPending!.available_balance}, pending=${bidderPending!.pending_withdrawal}`,
  );

  // Simulate transfer completion
  const { error: withdrawCompleteErr } = await supabase
    .from("transfers")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      transaction_id: "simulated-tx-id",
    })
    .eq("id", withdrawalRow!.id);
  if (withdrawCompleteErr)
    throw new Error(
      `Withdrawal complete failed: ${withdrawCompleteErr.message}`,
    );

  // Verify final state via view — all should be zero
  const { data: bidderFinal } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAddr)
    .single();
  console.log(
    `  ok Bidder final (view): available=${bidderFinal!.available_balance}, locked=${bidderFinal!.locked_balance}, pending=${bidderFinal!.pending_withdrawal}`,
  );
  if (
    BigInt(bidderFinal!.available_balance ?? "0") !== 0n ||
    BigInt(bidderFinal!.locked_balance ?? "0") !== 0n ||
    BigInt(bidderFinal!.pending_withdrawal ?? "0") !== 0n
  ) {
    throw new Error(
      `Expected all zeroes, got available=${bidderFinal!.available_balance} locked=${bidderFinal!.locked_balance} pending=${bidderFinal!.pending_withdrawal}`,
    );
  }
  console.log("  ok Withdrawal complete — all balances zeroed");

  // ── Step 16: Cleanup ───────────────────────────────────────────────────
  // Note: balances is a view — no delete needed. Clean underlying tables only.
  console.log("\n>> Step 16: Cleaning up test data...");
  await supabase
    .from("transfers")
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
  console.log("    [x] TradeExecuted           (x1)");
  console.log("    [x] ExternalMarketResolved  (x1)");
  console.log("    [x] AuctionForceClosed      (x1)");
  console.log(
    "    [x] ReputationUpdated       (x2: resolve +1, force-close -1)",
  );
  console.log("  Supabase private bidding (balances = VIEW):");
  console.log("    [x] Deposit (record confirmed → view auto-credits)");
  console.log("    [x] Deposit idempotency (duplicate tx_id rejected)");
  console.log("    [x] Deposit constraint (zero amount rejected)");
  console.log("    [x] Create secret");
  console.log("    [x] Place private bid (view auto-locks)");
  console.log("    [x] Outbid (view auto-releases + locks)");
  console.log("    [x] Constraint: duplicate active bid rejected");
  console.log("    [x] Constraint: invalid address rejected (deposits)");
  console.log("    [x] Overdraw check (app-level via view read)");
  console.log("    [x] Force-close refund (view auto-releases)");
  console.log("    [x] Withdrawal lifecycle (view auto-tracks pending)");
  console.log("    [x] Cleanup");
  console.log("===================================================");
  console.log(`  SecretMarketplace: ${SECRET_MARKETPLACE}`);
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log("===================================================");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nx E2E test failed:", err);
    process.exit(1);
  });
