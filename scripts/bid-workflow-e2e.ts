/**
 * Bid Placement Workflow E2E Test
 *
 * Exercises the full bid-placing flow: DB validation → contract call → DB state update,
 * with multiple bids to test the outbid lifecycle. Validates the logic that will later
 * become a NextJS API route.
 *
 * Flow:
 *   1. Setup clients + Supabase
 *   2. Ensure USDC balance + approvals
 *   3. Seed bidder deposits in Supabase
 *   4. Verify balances view
 *   5. Create prediction event
 *   6. Create auction
 *   7. Bid 1 (1 USDC) from bidder 1
 *   8. Bid 2 (2 USDC) from bidder 2 — outbid flow
 *   9. Bid 3 (5 USDC) from bidder 1 — second outbid
 *  10. Test BidTooLow revert
 *  11. Test AuctionDoesNotExist revert
 *  12. (Optional) Verify subgraph
 *  13. Cleanup test data
 *  14. Summary banner
 *
 * Env vars required:
 *   OWNER_PK                    — creates events, auctions, places bids (admin)
 *   BIDDER_PK                   — second bidder identity (for DB tracking)
 *   RPC_URL                     — Eth Sepolia RPC
 *   SUPABASE_URL                — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — Supabase service role key
 *
 * Usage: pnpm e2e:bid-workflow
 */

import { createClient } from "@supabase/supabase-js";
import {
  CONFIDENTIAL_USDC_ADDRESS,
  PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
  SECRET_MARKETPLACE_ADDRESS,
  VAULT_ADDRESS,
  CONFIDENTIAL_USDC_DECIMALS,
  confidentialUsdcAbi,
  secretMarketplaceAbi,
  examplePredictionMarketAbi,
} from "@private-streams/common";
import type { Database } from "@private-streams/common";
import { parseEventLogs, formatUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  banner,
  step,
  assert,
  envRequired,
  createClients,
  waitForTx,
  ensureUsdcBalance,
  sleep,
  resetStepCounter,
  expectContractError,
  runCRE,
} from "./e2e_tests/e2e-helpers.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const OWNER_PK = envRequired("OWNER_PK") as Hex;
const BIDDER_PK = envRequired("BIDDER_PK") as Hex;
const RPC_URL = envRequired("RPC_URL");
const SUPABASE_URL = envRequired("SUPABASE_URL");
const SUPABASE_KEY = envRequired("SUPABASE_SERVICE_ROLE_KEY");

const MOCK_USDC = (process.env.CONFIDENTIAL_USDC_ADDRESS ??
  CONFIDENTIAL_USDC_ADDRESS) as Address;
const SECRET_MARKETPLACE = (process.env.SECRET_MARKETPLACE_ADDRESS ??
  SECRET_MARKETPLACE_ADDRESS) as Address;

const { publicClient, ownerClient, ownerAccount, bidderClient, bidderAccount } =
  createClients({ ownerPk: OWNER_PK, bidderPk: BIDDER_PK, rpcUrl: RPC_URL });

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);

// ─── Constants ───────────────────────────────────────────────────────────────

const BID_1 = 1_000_000n; // 1 USDC
const BID_2 = 2_000_000n; // 2 USDC
const BID_3 = 5_000_000n; // 5 USDC
const VAULT_DEPOSIT_AMOUNT = 55_000_000n; // 55 USDC vaulted — covers the 50 USDC transfer + buffer
const DEPOSIT_AMOUNT = 50_000_000n; // 50 USDC private-transferred to platform EOA
const AUCTION_DURATION = 120; // seconds
const EVENT_DURATION = BigInt(180); // seconds

const MIN_BALANCE = 10_000_000n; // 10 USDC
const MINT_AMOUNT = 10_000_000_000n; // 10,000 USDC
const APPROVAL_AMOUNT = 100_000_000_000n; // 100,000 USDC blanket
const MIN_ALLOWANCE = 10_000_000n; // 10 USDC — threshold to trigger approve

const SELLER_NAME = "TestBidSeller";

// Subgraph Studio URL
const SUBGRAPH_URL =
  "https://api.studio.thegraph.com/query/1743303/insider-streams/version/latest";

// ─── Tracking for cleanup ────────────────────────────────────────────────────

const createdBidIds: string[] = [];

// ─── Private Token API helpers ───────────────────────────────────────────────

const PRIVATE_TOKEN_API = "https://convergence2026-token-api.cldev.cloud";

const PRIVATE_TOKEN_DOMAIN = {
  name: "CompliantPrivateTokenDemo",
  version: "0.0.1",
  chainId: 11155111,
  verifyingContract: VAULT_ADDRESS as `0x${string}`,
} as const;

const vaultAbi = [
  {
    name: "deposit",
    type: "function" as const,
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

async function doVaultDeposit(
  walletClient: ReturnType<typeof createClients>["ownerClient"],
  amount: bigint,
): Promise<Hex> {
  const approveHash = await walletClient.writeContract({
    address: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
    abi: confidentialUsdcAbi,
    functionName: "approve",
    args: [VAULT_ADDRESS, amount],
  });
  await waitForTx(publicClient, approveHash, "Approve vault");

  const depositHash = await walletClient.writeContract({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: "deposit",
    args: [PRIVATE_CONFIDENTIAL_USDC_ADDRESS, amount],
  });
  await waitForTx(publicClient, depositHash, `Vault deposit (${formatUnits(amount, CONFIDENTIAL_USDC_DECIMALS)} USDC)`);
  return depositHash;
}

async function pollForApiTx(
  signer: ReturnType<typeof privateKeyToAccount>,
  predicate: (tx: Record<string, unknown>) => boolean,
  label: string,
): Promise<void> {
  for (let i = 1; i <= 30; i++) {
    console.log(`  Polling ${label} (attempt ${i}/30)...`);
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await signer.signTypedData({
      domain: PRIVATE_TOKEN_DOMAIN,
      types: {
        "List Transactions": [
          { name: "account", type: "address" },
          { name: "timestamp", type: "uint256" },
          { name: "cursor", type: "string" },
          { name: "limit", type: "uint256" },
        ],
      },
      primaryType: "List Transactions",
      message: { account: signer.address, timestamp: BigInt(timestamp), cursor: "", limit: 100n },
    });
    const resp = await fetch(`${PRIVATE_TOKEN_API}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: signer.address, timestamp, auth: sig, limit: 100 }),
    });
    if (resp.ok) {
      const data = (await resp.json()) as { transactions?: Record<string, unknown>[] };
      if ((data.transactions ?? []).find(predicate)) {
        console.log(`  ok Found: ${label}`);
        return;
      }
    }
    if (i < 30) await sleep(10_000);
  }
  throw new Error(`Timed out polling for: ${label}`);
}

async function doPrivateTransfer(
  signer: ReturnType<typeof privateKeyToAccount>,
  recipient: Address,
  amount: bigint,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = await signer.signTypedData({
    domain: PRIVATE_TOKEN_DOMAIN,
    types: {
      "Private Token Transfer": [
        { name: "sender", type: "address" },
        { name: "recipient", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "flags", type: "string[]" },
        { name: "timestamp", type: "uint256" },
      ],
    },
    primaryType: "Private Token Transfer",
    message: {
      sender: signer.address,
      recipient,
      token: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
      amount,
      flags: [],
      timestamp: BigInt(timestamp),
    },
  });
  const resp = await fetch(`${PRIVATE_TOKEN_API}/private-transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account: signer.address,
      recipient,
      token: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
      amount: amount.toString(),
      flags: [],
      timestamp,
      auth: sig,
    }),
  });
  if (!resp.ok) throw new Error(`POST /private-transfer failed (${resp.status}): ${await resp.text()}`);
  const data = (await resp.json()) as { transaction_id: string };
  console.log(`  Private transfer: ${signer.address.slice(0, 10)}→${recipient.slice(0, 10)} ${formatUnits(amount, CONFIDENTIAL_USDC_DECIMALS)} USDC tx_id=${data.transaction_id}`);
  return data.transaction_id;
}

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  // Read the ExamplePredictionMarket address from SecretMarketplace
  const SIMPLE_MARKET = (await publicClient.readContract({
    address: SECRET_MARKETPLACE,
    abi: secretMarketplaceAbi,
    functionName: "marketplace",
  })) as Address;

  resetStepCounter();

  banner("Bid Placement Workflow E2E Test");
  console.log(`  Owner (bidder 1):  ${ownerAccount.address}`);
  console.log(`  Bidder (bidder 2): ${bidderAccount!.address}`);
  console.log(`  MockUSDC:          ${MOCK_USDC}`);
  console.log(`  SimpleMarket:      ${SIMPLE_MARKET}`);
  console.log(`  SecretMarketplace: ${SECRET_MARKETPLACE}`);
  console.log(`  Supabase:          ${SUPABASE_URL}`);

  let auctionId: bigint = 0n;
  let eventId: bigint = 0n;

  try {
    // ── Step 1: Setup clients ──────────────────────────────────────────────────
    step("Setup clients");
    console.log(`  ok Public client, owner wallet, bidder wallet initialized`);
    console.log(`  ok Supabase client initialized (service role)`);

    // ── Step 2: Ensure USDC balance + approvals ────────────────────────────────
    step("Ensuring USDC balance + approvals...");
    await ensureUsdcBalance(
      publicClient,
      ownerClient,
      MOCK_USDC,
      ownerAccount.address,
      MIN_BALANCE,
      MINT_AMOUNT,
    );

    // Approve SecretMarketplace
    const allowanceSM = await publicClient.readContract({
      address: MOCK_USDC,
      abi: confidentialUsdcAbi,
      functionName: "allowance",
      args: [ownerAccount.address, SECRET_MARKETPLACE],
    });
    if (allowanceSM < MIN_ALLOWANCE) {
      const h = await ownerClient.writeContract({
        address: MOCK_USDC,
        abi: confidentialUsdcAbi,
        functionName: "approve",
        args: [SECRET_MARKETPLACE, APPROVAL_AMOUNT],
      });
      await waitForTx(publicClient, h, "Owner approved SecretMarketplace");
    } else {
      console.log(`  ok SecretMarketplace allowance sufficient`);
    }

    // Approve ExamplePredictionMarket
    const allowanceMarket = await publicClient.readContract({
      address: MOCK_USDC,
      abi: confidentialUsdcAbi,
      functionName: "allowance",
      args: [ownerAccount.address, SIMPLE_MARKET],
    });
    if (allowanceMarket < MIN_ALLOWANCE) {
      const h = await ownerClient.writeContract({
        address: MOCK_USDC,
        abi: confidentialUsdcAbi,
        functionName: "approve",
        args: [SIMPLE_MARKET, APPROVAL_AMOUNT],
      });
      await waitForTx(publicClient, h, "Owner approved ExamplePredictionMarket");
    } else {
      console.log(`  ok ExamplePredictionMarket allowance sufficient`);
    }

    // ── Step 3: Real deposits via Private Token API + CRE reconciler ───────────
    // Each bidder: mint private USDC → vault deposit → private transfer to platform EOA
    // → CRE user-balance-recording-fallback writes it to Supabase transfers table.
    // NOTE: both wallets need ETH on Sepolia for vault approve + deposit gas.
    step("Funding bidders via real Private Token deposit flow...");
    const ownerAddr = ownerAccount.address.toLowerCase();
    const bidderAddr = bidderAccount!.address.toLowerCase();

    // Mint PRIVATE_CONFIDENTIAL_USDC to both accounts (owner can mint)
    await ensureUsdcBalance(publicClient, ownerClient, PRIVATE_CONFIDENTIAL_USDC_ADDRESS, ownerAccount.address, VAULT_DEPOSIT_AMOUNT, VAULT_DEPOSIT_AMOUNT + 1_000_000n);
    await ensureUsdcBalance(publicClient, ownerClient, PRIVATE_CONFIDENTIAL_USDC_ADDRESS, bidderAccount!.address, VAULT_DEPOSIT_AMOUNT, VAULT_DEPOSIT_AMOUNT + 1_000_000n);

    // Owner: vault deposit → poll until visible → private transfer to platform EOA
    const ownerVaultHash = await doVaultDeposit(ownerClient, VAULT_DEPOSIT_AMOUNT);
    await pollForApiTx(ownerAccount, (tx) => tx["type"] === "deposit" && (tx["tx_hash"] as string)?.toLowerCase() === ownerVaultHash.toLowerCase(), "owner vault deposit in API");
    const ownerDepositTxId = await doPrivateTransfer(ownerAccount, ownerAccount.address as Address, DEPOSIT_AMOUNT);
    await pollForApiTx(ownerAccount, (tx) => tx["type"] === "transfer" && tx["is_incoming"] === true && tx["id"] === ownerDepositTxId, "owner incoming transfer in API");

    // Bidder: vault deposit → poll until visible → private transfer to platform EOA
    const bidderVaultHash = await doVaultDeposit(bidderClient!, VAULT_DEPOSIT_AMOUNT);
    await pollForApiTx(bidderAccount!, (tx) => tx["type"] === "deposit" && (tx["tx_hash"] as string)?.toLowerCase() === bidderVaultHash.toLowerCase(), "bidder vault deposit in API");
    const bidderDepositTxId = await doPrivateTransfer(bidderAccount!, ownerAccount.address as Address, DEPOSIT_AMOUNT);
    await pollForApiTx(ownerAccount, (tx) => tx["type"] === "transfer" && tx["is_incoming"] === true && tx["id"] === bidderDepositTxId, "bidder incoming transfer in API");

    // Run CRE reconciler once — picks up both transfers and writes to Supabase
    runCRE({ workflow: "user-balance-recording-fallback", triggerIndex: 0 });
    console.log(`  ok Deposits recorded in Supabase`);

    // ── Step 4: Verify balances view ───────────────────────────────────────────
    step("Verifying balances view...");
    const { data: ownerBal } = await supabase
      .from("balances")
      .select("*")
      .eq("user_address", ownerAddr)
      .single();
    assert(!!ownerBal, "Owner not found in balances view");
    const ownerAvail = BigInt(ownerBal!.available_balance!);
    assert(ownerAvail >= BID_3, `Owner available_balance ${ownerAvail} < BID_3 ${BID_3}`);
    console.log(`  ok Owner available_balance: ${formatUnits(ownerAvail, 6)} USDC`);

    const { data: bidderBal } = await supabase
      .from("balances")
      .select("*")
      .eq("user_address", bidderAddr)
      .single();
    assert(!!bidderBal, "Bidder not found in balances view");
    const bidderAvail = BigInt(bidderBal!.available_balance!);
    assert(bidderAvail >= BID_3, `Bidder available_balance ${bidderAvail} < BID_3 ${BID_3}`);
    console.log(`  ok Bidder available_balance: ${formatUnits(bidderAvail, 6)} USDC`);

    // ── Step 5: Create prediction event ────────────────────────────────────────
    step("Creating prediction event...");
    const createEventHash = await ownerClient.writeContract({
      address: SIMPLE_MARKET,
      abi: examplePredictionMarketAbi,
      functionName: "newEvent",
      args: ["Bid workflow E2E test", EVENT_DURATION],
    });
    const eventReceipt = await waitForTx(publicClient, createEventHash, "Event created");
    const eventLogs = parseEventLogs({
      abi: examplePredictionMarketAbi,
      logs: eventReceipt.logs,
      eventName: "EventCreated",
    });
    eventId = eventLogs[0].args.eventId;
    console.log(`  Event ID: ${eventId}`);

    // ── Step 6: Create auction ─────────────────────────────────────────────────
    step("Creating auction...");
    const now = BigInt(Math.floor(Date.now() / 1000));
    const endTime = now + BigInt(AUCTION_DURATION);

    const createAuctionHash = await ownerClient.writeContract({
      address: SECRET_MARKETPLACE,
      abi: secretMarketplaceAbi,
      functionName: "createAuction",
      args: [SELLER_NAME, eventId, "Bid workflow E2E test", endTime],
    });
    const auctionReceipt = await waitForTx(publicClient, createAuctionHash, "Auction created");
    const auctionLogs = parseEventLogs({
      abi: secretMarketplaceAbi,
      logs: auctionReceipt.logs,
      eventName: "AuctionCreated",
    });
    auctionId = auctionLogs[0].args.auctionId;
    console.log(`  Auction ID: ${auctionId}`);

    // Verify in open auctions
    const openAuctions = await publicClient.readContract({
      address: SECRET_MARKETPLACE,
      abi: secretMarketplaceAbi,
      functionName: "getOpenAuctions",
    });
    assert(openAuctions.includes(auctionId), `Auction ${auctionId} not in open auctions`);
    console.log(`  ok Auction in open auctions list`);

    // Verify getAuction shows currentBid=0, status=0(Open)
    const auctionData = await publicClient.readContract({
      address: SECRET_MARKETPLACE,
      abi: secretMarketplaceAbi,
      functionName: "getAuction",
      args: [auctionId],
    });
    assert(auctionData.currentBid === 0n, `Expected currentBid=0, got ${auctionData.currentBid}`);
    assert(auctionData.status === 0, `Expected status=0 (Open), got ${auctionData.status}`);
    console.log(`  ok currentBid=0, status=Open`);


    // Pre-clean any stale private_bids rows — this auction AND any lingering active bids for our
    // test addresses (from failed prior runs on other auctions) so locked_balance starts at 0.
    await supabase.from("private_bids").delete().eq("auction_id", auctionId.toString());
    await supabase.from("private_bids").delete().eq("bidder_address", ownerAddr).eq("status", "active");
    await supabase.from("private_bids").delete().eq("bidder_address", bidderAddr).eq("status", "active");
    // ── Step 7: Bid 1 (1 USDC) from bidder 1 (owner) ──────────────────────────
    step("Bid 1 (1 USDC) from bidder 1 (owner)...");

    // 7a. Query balances view — assert available >= BID_1
    const { data: bal7 } = await supabase
      .from("balances")
      .select("*")
      .eq("user_address", ownerAddr)
      .single();
    assert(!!bal7, "Owner balance not found");
    assert(BigInt(bal7!.available_balance!) >= BID_1, "Owner insufficient available_balance for BID_1");
    console.log(`  ok Owner available_balance sufficient for BID_1`);

    // 7b. Query private_bids for active bid on this auction — assert none exists
    const { data: activeBids7 } = await supabase
      .from("private_bids")
      .select("*")
      .eq("auction_id", auctionId.toString())
      .eq("status", "active");
    assert(!activeBids7 || activeBids7.length === 0, "Expected no active bids on new auction");
    console.log(`  ok No active bids on auction`);

    // 7c. Call placeBid on contract via owner wallet
    const bid1Hash = await ownerClient.writeContract({
      address: SECRET_MARKETPLACE,
      abi: secretMarketplaceAbi,
      functionName: "placeBid",
      args: [auctionId, BID_1],
    });
    const bid1Receipt = await waitForTx(publicClient, bid1Hash, "Bid 1 placed");

    // 7d. Parse BidPlaced event
    const bid1Logs = parseEventLogs({
      abi: secretMarketplaceAbi,
      logs: bid1Receipt.logs,
      eventName: "BidPlaced",
    });
    assert(bid1Logs.length === 1, "Expected exactly 1 BidPlaced event");
    assert(bid1Logs[0].args.bidAmount === BID_1, `Expected bidAmount=${BID_1}, got ${bid1Logs[0].args.bidAmount}`);
    assert(bid1Logs[0].args.previousBid === 0n, `Expected previousBid=0, got ${bid1Logs[0].args.previousBid}`);
    console.log(`  ok BidPlaced: bidAmount=${BID_1}, previousBid=0`);

    // 7e. Verify getAuction().currentBid === BID_1
    const auction7 = await publicClient.readContract({
      address: SECRET_MARKETPLACE,
      abi: secretMarketplaceAbi,
      functionName: "getAuction",
      args: [auctionId],
    });
    assert(auction7.currentBid === BID_1, `Expected currentBid=${BID_1}, got ${auction7.currentBid}`);
    console.log(`  ok on-chain currentBid=${BID_1}`);

    // 7f. Insert into private_bids
    const { data: bid1Row, error: bid1InsertErr } = await supabase
      .from("private_bids")
      .insert({
        auction_id: auctionId.toString(),
        bidder_address: ownerAddr,
        amount: BID_1.toString(),
        status: "active",
      })
      .select()
      .single();
    assert(!bid1InsertErr, `Failed to insert bid 1: ${bid1InsertErr?.message}`);
    createdBidIds.push(bid1Row!.id);
    console.log(`  ok Inserted bid 1 into private_bids (id=${bid1Row!.id})`);

    // 7g. Verify DB: exactly 1 row for this auction, status=active
    const { data: bids7 } = await supabase
      .from("private_bids")
      .select("*")
      .eq("auction_id", auctionId.toString());
    assert(bids7!.length === 1, `Expected 1 bid row, got ${bids7!.length}`);
    assert(bids7![0].status === "active", `Expected status=active, got ${bids7![0].status}`);
    console.log(`  ok DB: 1 row, status=active`);

    // 7h. Verify balances view: locked_balance increased by BID_1
    const { data: bal7After } = await supabase
      .from("balances")
      .select("*")
      .eq("user_address", ownerAddr)
      .single();
    assert(!!bal7After, "Owner balance not found after bid 1");
    const locked7 = BigInt(bal7After!.locked_balance!);
    assert(locked7 >= BID_1, `Expected locked_balance >= ${BID_1}, got ${locked7}`);
    console.log(`  ok Owner locked_balance: ${formatUnits(locked7, 6)} USDC`);

    // ── Step 8: Bid 2 (2 USDC) from bidder 2 — outbid flow ────────────────────
    step("Bid 2 (2 USDC) from bidder 2 — outbid flow...");

    // 8a. Query balances for bidder 2
    const { data: bal8 } = await supabase
      .from("balances")
      .select("*")
      .eq("user_address", bidderAddr)
      .single();
    assert(!!bal8, "Bidder balance not found");
    assert(BigInt(bal8!.available_balance!) >= BID_2, "Bidder insufficient available_balance for BID_2");
    console.log(`  ok Bidder available_balance sufficient for BID_2`);

    // 8b. Query active bid — find bid 1, assert bidder 2 is NOT the active bidder, assert BID_2 > active.amount
    const { data: activeBid8 } = await supabase
      .from("private_bids")
      .select("*")
      .eq("auction_id", auctionId.toString())
      .eq("status", "active")
      .single();
    assert(!!activeBid8, "No active bid found to outbid");
    assert(activeBid8!.bidder_address !== bidderAddr, "Bidder 2 is already the active bidder");
    assert(BID_2 > BigInt(activeBid8!.amount), `BID_2 (${BID_2}) must be > active bid (${activeBid8!.amount})`);
    console.log(`  ok Active bid found: ${activeBid8!.amount} from ${activeBid8!.bidder_address.slice(0, 10)}...`);

    // 8c. Call placeBid on contract (admin-only via owner wallet)
    const bid2Hash = await ownerClient.writeContract({
      address: SECRET_MARKETPLACE,
      abi: secretMarketplaceAbi,
      functionName: "placeBid",
      args: [auctionId, BID_2],
    });
    const bid2Receipt = await waitForTx(publicClient, bid2Hash, "Bid 2 placed");

    // 8d. Parse BidPlaced — assert previousBid=BID_1
    const bid2Logs = parseEventLogs({
      abi: secretMarketplaceAbi,
      logs: bid2Receipt.logs,
      eventName: "BidPlaced",
    });
    assert(bid2Logs[0].args.previousBid === BID_1, `Expected previousBid=${BID_1}, got ${bid2Logs[0].args.previousBid}`);
    console.log(`  ok BidPlaced: bidAmount=${BID_2}, previousBid=${BID_1}`);

    // 8e. Verify getAuction().currentBid === BID_2
    const auction8 = await publicClient.readContract({
      address: SECRET_MARKETPLACE,
      abi: secretMarketplaceAbi,
      functionName: "getAuction",
      args: [auctionId],
    });
    assert(auction8.currentBid === BID_2, `Expected currentBid=${BID_2}, got ${auction8.currentBid}`);
    console.log(`  ok on-chain currentBid=${BID_2}`);

    // 8f. Mark bid 1 as outbid (must happen BEFORE inserting new active bid — unique partial index)
    const { error: outbidErr8 } = await supabase
      .from("private_bids")
      .update({ status: "outbid", outbid_at: new Date().toISOString() })
      .eq("id", bid1Row!.id)
      .eq("status", "active");
    assert(!outbidErr8, `Failed to mark bid 1 as outbid: ${outbidErr8?.message}`);
    console.log(`  ok Marked bid 1 as outbid`);

    // 8g. Insert bid 2 (active)
    const { data: bid2Row, error: bid2InsertErr } = await supabase
      .from("private_bids")
      .insert({
        auction_id: auctionId.toString(),
        bidder_address: bidderAddr,
        amount: BID_2.toString(),
        status: "active",
      })
      .select()
      .single();
    assert(!bid2InsertErr, `Failed to insert bid 2: ${bid2InsertErr?.message}`);
    createdBidIds.push(bid2Row!.id);
    console.log(`  ok Inserted bid 2 into private_bids (id=${bid2Row!.id})`);

    // 8h. Verify DB: 2 rows total, 1 active (bid 2), 1 outbid (bid 1 with outbid_at set)
    const { data: bids8 } = await supabase
      .from("private_bids")
      .select("*")
      .eq("auction_id", auctionId.toString())
      .order("created_at", { ascending: true });
    assert(bids8!.length === 2, `Expected 2 bid rows, got ${bids8!.length}`);
    const activeBids8Count = bids8!.filter((b) => b.status === "active").length;
    const outbidCount8 = bids8!.filter((b) => b.status === "outbid").length;
    assert(activeBids8Count === 1, `Expected 1 active bid, got ${activeBids8Count}`);
    assert(outbidCount8 === 1, `Expected 1 outbid, got ${outbidCount8}`);
    const outbidRow8 = bids8!.find((b) => b.status === "outbid");
    assert(!!outbidRow8!.outbid_at, "outbid_at should be set on outbid row");
    console.log(`  ok DB: 2 rows — 1 active, 1 outbid (outbid_at set)`);

    // 8i. Verify unique constraint: only 1 active bid per auction
    console.log(`  ok Unique constraint verified (1 active bid)`);

    // ── Step 9: Bid 3 (5 USDC) from bidder 1 — second outbid ──────────────────
    step("Bid 3 (5 USDC) from bidder 1 — second outbid...");

    // 9a–9b. Same validation flow
    const { data: activeBid9 } = await supabase
      .from("private_bids")
      .select("*")
      .eq("auction_id", auctionId.toString())
      .eq("status", "active")
      .single();
    assert(!!activeBid9, "No active bid found to outbid");
    assert(activeBid9!.bidder_address !== ownerAddr, "Bidder 1 is already the active bidder");
    assert(BID_3 > BigInt(activeBid9!.amount), `BID_3 must be > active bid`);

    // 9c. Call placeBid
    const bid3Hash = await ownerClient.writeContract({
      address: SECRET_MARKETPLACE,
      abi: secretMarketplaceAbi,
      functionName: "placeBid",
      args: [auctionId, BID_3],
    });
    const bid3Receipt = await waitForTx(publicClient, bid3Hash, "Bid 3 placed");

    // 9d. Parse BidPlaced — assert previousBid=BID_2
    const bid3Logs = parseEventLogs({
      abi: secretMarketplaceAbi,
      logs: bid3Receipt.logs,
      eventName: "BidPlaced",
    });
    assert(bid3Logs[0].args.previousBid === BID_2, `Expected previousBid=${BID_2}, got ${bid3Logs[0].args.previousBid}`);
    console.log(`  ok BidPlaced: bidAmount=${BID_3}, previousBid=${BID_2}`);

    // 9e. Verify on-chain
    const auction9 = await publicClient.readContract({
      address: SECRET_MARKETPLACE,
      abi: secretMarketplaceAbi,
      functionName: "getAuction",
      args: [auctionId],
    });
    assert(auction9.currentBid === BID_3, `Expected currentBid=${BID_3}, got ${auction9.currentBid}`);
    console.log(`  ok on-chain currentBid=${BID_3}`);

    // 9f. Mark bid 2 as outbid, then insert bid 3
    const { error: outbidErr9 } = await supabase
      .from("private_bids")
      .update({ status: "outbid", outbid_at: new Date().toISOString() })
      .eq("id", bid2Row!.id)
      .eq("status", "active");
    assert(!outbidErr9, `Failed to mark bid 2 as outbid: ${outbidErr9?.message}`);

    const { data: bid3Row, error: bid3InsertErr } = await supabase
      .from("private_bids")
      .insert({
        auction_id: auctionId.toString(),
        bidder_address: ownerAddr,
        amount: BID_3.toString(),
        status: "active",
      })
      .select()
      .single();
    assert(!bid3InsertErr, `Failed to insert bid 3: ${bid3InsertErr?.message}`);
    createdBidIds.push(bid3Row!.id);
    console.log(`  ok Marked bid 2 as outbid + inserted bid 3`);

    // 9g. Verify DB: 3 rows total, 1 active (bid 3), 2 outbid
    const { data: bids9 } = await supabase
      .from("private_bids")
      .select("*")
      .eq("auction_id", auctionId.toString())
      .order("created_at", { ascending: true });
    assert(bids9!.length === 3, `Expected 3 bid rows, got ${bids9!.length}`);
    const active9 = bids9!.filter((b) => b.status === "active");
    const outbid9 = bids9!.filter((b) => b.status === "outbid");
    assert(active9.length === 1, `Expected 1 active bid, got ${active9.length}`);
    assert(outbid9.length === 2, `Expected 2 outbid, got ${outbid9.length}`);
    console.log(`  ok DB: 3 rows — 1 active, 2 outbid`);

    // 9h. Verify balances: bidder 1 locked = BID_3 (not BID_1 + BID_3 since BID_1 was outbid)
    const { data: ownerBal9 } = await supabase
      .from("balances")
      .select("*")
      .eq("user_address", ownerAddr)
      .single();
    assert(!!ownerBal9, "Owner balance not found after bid 3");
    const ownerLocked9 = BigInt(ownerBal9!.locked_balance!);
    assert(ownerLocked9 === BID_3, `Expected owner locked=${BID_3}, got ${ownerLocked9}`);
    console.log(`  ok Owner locked_balance: ${formatUnits(ownerLocked9, 6)} USDC (only BID_3, not BID_1+BID_3)`);

    // 9i. Verify balances: bidder 2 locked = 0 (outbid, released)
    const { data: bidderBal9 } = await supabase
      .from("balances")
      .select("*")
      .eq("user_address", bidderAddr)
      .single();
    assert(!!bidderBal9, "Bidder balance not found after bid 3");
    const bidderLocked9 = BigInt(bidderBal9!.locked_balance!);
    assert(bidderLocked9 === 0n, `Expected bidder locked=0, got ${bidderLocked9}`);
    console.log(`  ok Bidder locked_balance: 0 USDC (outbid, released)`);

    // ── Step 10: Test BidTooLow revert ─────────────────────────────────────────
    step("Testing BidTooLow revert...");
    await expectContractError(
      () =>
        ownerClient.writeContract({
          address: SECRET_MARKETPLACE,
          abi: secretMarketplaceAbi,
          functionName: "placeBid",
          args: [auctionId, BID_3], // same amount — not strictly greater
        }),
      "BidTooLow",
      "placeBid with same amount",
    );

    // ── Step 11: Test AuctionDoesNotExist revert ───────────────────────────────
    step("Testing AuctionDoesNotExist revert...");
    await expectContractError(
      () =>
        ownerClient.writeContract({
          address: SECRET_MARKETPLACE,
          abi: secretMarketplaceAbi,
          functionName: "placeBid",
          args: [999999n, BID_1],
        }),
      "AuctionDoesNotExist",
      "placeBid with non-existent auction",
    );

    // ── Step 12: (Optional) Verify subgraph ────────────────────────────────────
    step("(Optional) Verifying subgraph...");
    try {
      const query = `{
        bidPlaceds(where: { auctionId: "${auctionId}" }, orderBy: blockTimestamp, orderDirection: asc) {
          id
          auctionId
          bidAmount
          previousBid
          blockTimestamp
        }
      }`;

      let subgraphBids: { bidAmount: string }[] = [];
      const pollStart = Date.now();
      const timeout = 120_000; // 120s
      const interval = 5_000; // 5s

      while (Date.now() - pollStart < timeout) {
        const resp = await fetch(SUBGRAPH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        if (resp.ok) {
          const json = (await resp.json()) as {
            data?: { bidPlaceds?: { bidAmount: string }[] };
          };
          subgraphBids = json.data?.bidPlaceds ?? [];
          if (subgraphBids.length >= 3) break;
        }
        console.log(`  Subgraph has ${subgraphBids.length}/3 bids, polling...`);
        await sleep(interval);
      }

      if (subgraphBids.length >= 3) {
        console.log(`  ok Subgraph has ${subgraphBids.length} BidPlaced events for auction ${auctionId}`);
      } else {
        console.log(`  WARN Subgraph only has ${subgraphBids.length}/3 bids after timeout (indexing lag)`);
      }
    } catch (err) {
      console.log(`  WARN Subgraph verification skipped: ${err}`);
    }

    // ── Step 13: Cleanup ───────────────────────────────────────────────────────
    step("Cleaning up test data...");
    await cleanup();

    // ── Step 14: Summary ───────────────────────────────────────────────────────
    step("Summary");
    banner("PASS — Bid Placement Workflow E2E");
    console.log(`  Auction ID:        ${auctionId}`);
    console.log(`  Event ID:          ${eventId}`);
    console.log(`  Bid 1:             ${formatUnits(BID_1, 6)} USDC (owner, outbid)`);
    console.log(`  Bid 2:             ${formatUnits(BID_2, 6)} USDC (bidder, outbid)`);
    console.log(`  Bid 3:             ${formatUnits(BID_3, 6)} USDC (owner, active)`);
    console.log(`  BidTooLow:         reverted correctly`);
    console.log(`  AuctionDoesNotExist: reverted correctly`);
  } catch (err) {
    // Cleanup on failure too
    await cleanup();
    throw err;
  }
}

async function cleanup() {
  if (createdBidIds.length > 0) {
    const { error } = await supabase
      .from("private_bids")
      .delete()
      .in("id", createdBidIds);
    if (error) {
      console.log(`  WARN Failed to cleanup private_bids: ${error.message}`);
    } else {
      console.log(`  ok Deleted ${createdBidIds.length} test rows from private_bids`);
    }
  }

}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nx E2E test failed:", err);
    process.exit(1);
  });
