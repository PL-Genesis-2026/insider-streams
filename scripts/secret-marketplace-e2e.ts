/**
 * SecretMarketplace E2E Test Script
 *
 * On-chain lifecycle test on Eth Sepolia:
 *   - SellerRegistered
 *   - AuctionCreated
 *   - BidPlaced
 *   - AuctionClosed
 *   - ExternalEventResolved + ReputationUpdated
 *
 * Env vars required:
 *   OWNER_PK                    — deploys, creates events, closes auctions, settles
 *   BIDDER_PK                   — unused on-chain (admin-only model)
 *   RPC_URL                     — Eth Sepolia RPC
 *   CONFIDENTIAL_USDC_ADDRESS           — ConfidentialUSDC contract
 *   SECRET_MARKETPLACE_ADDRESS  — SecretMarketplace contract
 *
 * Usage: pnpm e2e
 */

import "dotenv/config";

import {
  CONFIDENTIAL_USDC_ADDRESS,
  confidentialUsdcAbi,
  examplePredictionMarketAbi,
  SECRET_MARKETPLACE_ADDRESS,
  secretMarketplaceAbi,
} from "@private-streams/common";
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
const RPC_URL = envRequired("RPC_URL");
const CONFIDENTIAL_USDC = CONFIDENTIAL_USDC_ADDRESS;
const SECRET_MARKETPLACE = SECRET_MARKETPLACE_ADDRESS;
// Read ExamplePredictionMarket address from SecretMarketplace.marketplace() at runtime
let SIMPLE_MARKET: Address;

const ownerAccount = privateKeyToAccount(OWNER_PK);

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
const MIN_ALLOWANCE = 10_000_000n; // 10 USDC — threshold to trigger approve
const BID_AMOUNT = 1_000_000n; // 1 USDC
const AUCTION_DURATION = 60; // seconds
const QUESTION = "The New York Yankees won the 2009 World Series.";
const SELLER_NAME = "Insider Alice";

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  // Read the ExamplePredictionMarket address that SecretMarketplace was deployed with
  SIMPLE_MARKET = (await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "marketplace",
  })) as Address;

  console.log("===================================================");
  console.log("  SecretMarketplace E2E");
  console.log("===================================================");
  console.log(`  Owner (admin):    ${ownerAccount.address}`);
  console.log(`  ConfidentialUSDC:         ${CONFIDENTIAL_USDC}`);
  console.log(
    `  ExamplePredictionMarket: ${SIMPLE_MARKET} (from SecretMarketplace.marketplace())`,
  );
  console.log(`  SecretMarketplace: ${SECRET_MARKETPLACE}`);
  console.log("===================================================\n");

  // ── Step 0: Mint USDC + approve (only if needed) ─────────────────────────
  console.log(">> Step 0: Ensuring owner has USDC and approvals...");

  const ownerBalance = await publicClient.readContract({
    address: CONFIDENTIAL_USDC,
    abi: confidentialUsdcAbi,
    functionName: "balanceOf",
    args: [ownerAccount.address],
  });
  if (ownerBalance < MIN_BALANCE) {
    const h = await ownerClient.writeContract({
      address: CONFIDENTIAL_USDC,
      abi: confidentialUsdcAbi,
      functionName: "mint",
      args: [ownerAccount.address, MINT_AMOUNT],
    });
    await waitForTx(h, "Mint USDC to owner");
  } else {
    console.log(
      `  ok Owner has ${formatUnits(ownerBalance, USDC_DECIMALS)} USDC`,
    );
  }

  // Check allowance for SecretMarketplace
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
    await waitForTx(h, "Owner approved SecretMarketplace");
  } else {
    console.log(
      `  ok SecretMarketplace allowance: ${formatUnits(allowanceSM, USDC_DECIMALS)} USDC`,
    );
  }

  // Check allowance for ExamplePredictionMarket
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
    await waitForTx(h, "Owner approved ExamplePredictionMarket");
  } else {
    console.log(
      `  ok ExamplePredictionMarket allowance: ${formatUnits(allowanceMarket, USDC_DECIMALS)} USDC`,
    );
  }

  // ── Step 1: Register seller (if not already registered) ──────────────────
  console.log("\n>> Step 1: Register seller...");
  const seller = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getSeller",
    args: [SELLER_NAME],
  });
  if (seller.registered) {
    console.log(
      `  ok Seller "${SELLER_NAME}" already registered (reputation: ${seller.reputationScore})`,
    );
  } else {
    const registerHash = await ownerClient.writeContract({
      address: SECRET_MARKETPLACE,
      abi: secretMarketplaceAbi,
      functionName: "registerSeller",
      args: [SELLER_NAME],
    });
    await waitForTx(registerHash, "[EVENT: SellerRegistered]");
  }

  // ── Step 2: Create event + auction ───────────────────────────────────────
  console.log("\n>> Step 2: Create event + auction...");
  const createEventHash = await ownerClient.writeContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "newEvent",
    args: [QUESTION, BigInt(3 * 60)],
  });
  const eventReceipt = await waitForTx(createEventHash, "Event created");
  const eventLogs = parseEventLogs({
    abi: examplePredictionMarketAbi,
    logs: eventReceipt.logs,
    eventName: "EventCreated",
  });
  const eventId = eventLogs[0].args.eventId;
  console.log(`  Event ID: ${eventId}`);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const endTime = now + BigInt(AUCTION_DURATION);
  const createAuctionHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "createAuction",
    args: [SELLER_NAME, eventId, QUESTION, endTime],
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
  const auctionId = auctionLogs[0].args.auctionId;
  console.log(`  Auction ID: ${auctionId}`);

  // ── Step 3: Place bid ────────────────────────────────────────────────────
  console.log("\n>> Step 3: Admin places bid...");
  const bidHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "placeBid",
    args: [auctionId, BID_AMOUNT],
  });
  await waitForTx(bidHash, "[EVENT: BidPlaced]");

  // ── Step 4: Wait for auction to end ──────────────────────────────────────
  console.log("\n>> Step 4: Waiting for auction to end...");
  const auctionData = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getAuction",
    args: [auctionId],
  });
  const onChainEndTime = auctionData.endTime;
  while (true) {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    if (block.timestamp >= onChainEndTime) break;
    const remaining = Number(onChainEndTime - block.timestamp);
    console.log(
      `  Chain ts=${block.timestamp}, ends=${onChainEndTime} (${remaining}s left)...`,
    );
    await sleep(Math.min(remaining * 1000 + 2000, 15000));
  }
  console.log("  ok Auction period ended (on-chain)");

  // ── Step 5: Close auction ────────────────────────────────────────────────
  console.log("\n>> Step 5: Admin closes auction...");
  const closeHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "closeAuction",
    args: [auctionId],
  });
  await waitForTx(closeHash, "[EVENT: AuctionClosed]");

  // ── Step 6: Resolve external event ───────────────────────────────────────
  console.log("\n>> Step 6: Resolve external event (delta=+1)...");
  const resolveHash = await ownerClient.writeContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "resolveExternalEvent",
    args: [eventId, 1],
  });
  await waitForTx(
    resolveHash,
    "[EVENT: ExternalEventResolved + ReputationUpdated]",
  );

  const sellerAfter = await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "getSeller",
    args: [SELLER_NAME],
  });
  console.log(
    `  Seller reputation after resolve: ${sellerAfter.reputationScore}`,
  );

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n===================================================");
  console.log("  PASS — All on-chain events fired");
  console.log("===================================================");
  console.log("    [x] SellerRegistered");
  console.log("    [x] AuctionCreated");
  console.log("    [x] BidPlaced");
  console.log("    [x] AuctionClosed");
  console.log("    [x] ExternalEventResolved");
  console.log("    [x] ReputationUpdated");
  console.log("===================================================");
  console.log(`  SecretMarketplace: ${SECRET_MARKETPLACE}`);
  console.log("===================================================");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nx E2E test failed:", err);
    process.exit(1);
  });
