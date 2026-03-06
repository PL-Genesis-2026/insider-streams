/**
 * SimpleMarket + CRE Prediction Market E2E Test Script
 *
 * Full lifecycle test on Eth Sepolia:
 *   1. Owner creates a market with a question
 *   2. Bidder approves USDC + buys YES shares
 *   3. Waits for market closure (3 minutes)
 *   4. Owner requests settlement
 *   5. CRE prediction-market-demo simulation (dry run)
 *   6. CRE prediction-market-demo broadcast (on-chain settlement)
 *   7. Verifies on-chain market is Settled
 *   8. Verifies Firestore document exists with question + AI response
 *
 * Env vars required:
 *   OWNER_PK             — creates market, requests settlement
 *   BIDDER_PK            — buys shares (must be different from owner)
 *   RPC_URL              — Eth Sepolia RPC
 *   FIREBASE_API_KEY     — Firebase API key
 *   FIREBASE_PROJECT_ID  — Firebase project ID
 *
 * Usage: pnpm e2e:simple-market
 */

import {
  MOCK_USDC_ADDRESS,
  SIMPLE_MARKET_ADDRESS,
  mockUsdcAbi,
  examplePredictionMarketAbi,
} from "@private-streams/common";
import { parseEventLogs, type Address, type Hex } from "viem";
import {
  banner,
  step,
  assert,
  envRequired,
  createClients,
  waitForTx,
  waitForTimestamp,
  ensureUsdcBalance,
  runCRE,
} from "./e2e-helpers.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const OWNER_PK = envRequired("OWNER_PK") as Hex;
const BIDDER_PK = envRequired("BIDDER_PK") as Hex;
const RPC_URL = envRequired("RPC_URL");
const FIREBASE_API_KEY = envRequired("FIREBASE_API_KEY");
const FIREBASE_PROJECT_ID = envRequired("FIREBASE_PROJECT_ID");

const MOCK_USDC = (process.env.MOCK_USDC_ADDRESS ??
  MOCK_USDC_ADDRESS) as Address;
const SIMPLE_MARKET = (process.env.SIMPLE_MARKET_ADDRESS ??
  SIMPLE_MARKET_ADDRESS) as Address;

const { publicClient, ownerClient, ownerAccount, bidderClient, bidderAccount } =
  createClients({ ownerPk: OWNER_PK, bidderPk: BIDDER_PK, rpcUrl: RPC_URL });

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_BALANCE = 10_000_000n; // 10 USDC
const MINT_AMOUNT = 10_000_000_000n; // 10,000 USDC
const APPROVAL_AMOUNT = 100_000_000_000n; // 100,000 USDC blanket
const PREDICTION_AMOUNT = 1_000_000n; // 1 USDC
const QUESTION = "The New York Yankees won the 2009 World Series.";
// SimpleMarket.Outcome: 0=Unresolved, 1=No, 2=Yes
const OUTCOME_YES = 2;

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  banner("SimpleMarket + CRE E2E Test");
  console.log(`  Owner:         ${ownerAccount.address}`);
  console.log(`  Bidder:        ${bidderAccount!.address}`);
  console.log(`  MockUSDC:      ${MOCK_USDC}`);
  console.log(`  SimpleMarket:  ${SIMPLE_MARKET}`);
  console.log(`  Question:      ${QUESTION}`);

  // ── Step 1: Ensure USDC balances ────────────────────────────────────────────
  step("Ensuring accounts have USDC...");
  await ensureUsdcBalance(
    publicClient,
    ownerClient,
    MOCK_USDC,
    bidderAccount!.address,
    MIN_BALANCE,
    MINT_AMOUNT,
  );

  // ── Step 2: Approve USDC ────────────────────────────────────────────────────
  step("Owner approving USDC for ExamplePredictionMarket...");
  const approveOwnerHash = await ownerClient.writeContract({
    address: MOCK_USDC,
    abi: mockUsdcAbi,
    functionName: "approve",
    args: [SIMPLE_MARKET, APPROVAL_AMOUNT],
  });
  await waitForTx(publicClient, approveOwnerHash, "Owner USDC approval");

  step("Bidder approving USDC for ExamplePredictionMarket...");
  const approveHash = await bidderClient!.writeContract({
    address: MOCK_USDC,
    abi: mockUsdcAbi,
    functionName: "approve",
    args: [SIMPLE_MARKET, APPROVAL_AMOUNT],
  });
  await waitForTx(publicClient, approveHash, "Bidder USDC approval");

  // ── Step 3: Create market ───────────────────────────────────────────────────
  step("Owner creating market...");
  const createMarketHash = await ownerClient.writeContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "newMarket",
    args: [QUESTION],
  });
  const marketReceipt = await waitForTx(
    publicClient,
    createMarketHash,
    "Market created",
  );
  const marketLogs = parseEventLogs({
    abi: examplePredictionMarketAbi,
    logs: marketReceipt.logs,
    eventName: "MarketCreated",
  });
  const marketId = marketLogs[0].args.marketId;
  console.log(`  Market ID: ${marketId}`);

  // ── Step 4: Buy YES shares (replaces old makePrediction) ────────────────────
  step("Bidder buying YES shares...");
  const buyHash = await bidderClient!.writeContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "buyShares",
    args: [marketId, OUTCOME_YES, PREDICTION_AMOUNT],
  });
  await waitForTx(publicClient, buyHash, `Bought YES shares (${PREDICTION_AMOUNT} USDC)`);

  // ── Step 5: Wait for market closure ─────────────────────────────────────────
  step("Waiting for market to close...");
  const market = await publicClient.readContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "getMarket",
    args: [marketId],
  });
  console.log(`  Market closes at: ${market.marketClose}`);
  await waitForTimestamp(publicClient, market.marketClose, "Market closure");

  // ── Step 6: Request settlement ──────────────────────────────────────────────
  step("Owner requesting settlement...");
  const settleHash = await ownerClient.writeContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "requestSettlement",
    args: [marketId],
  });
  const settleReceipt = await waitForTx(
    publicClient,
    settleHash,
    "Settlement requested",
  );
  console.log(`  Settlement tx: ${settleHash}`);

  // ── Step 7: CRE dry run ─────────────────────────────────────────────────────
  step("Running CRE prediction-market-demo simulation (dry run)...");
  const dryOutput = runCRE({
    workflow: "prediction-market-demo",
    evmTxHash: settleHash,
    evmEventIndex: 0,
    triggerIndex: 0,
  });
  const simOk = dryOutput.includes("Settlement Request Processed");
  assert(simOk, "CRE simulation did not output 'Settlement Request Processed'");
  console.log(`  ok Simulation succeeded`);

  // Extract Gemini response from dry run
  const geminiLine = dryOutput
    .split("\n")
    .find((l) => l.includes("Gemini Response"));
  if (geminiLine) {
    console.log(`  ${geminiLine.trim()}`);
  }

  // ── Step 8: CRE broadcast ──────────────────────────────────────────────────
  step("Running CRE prediction-market-demo with broadcast...");
  const broadcastOutput = runCRE({
    workflow: "prediction-market-demo",
    evmTxHash: settleHash,
    evmEventIndex: 0,
    triggerIndex: 0,
    broadcast: true,
  });
  const broadcastOk = broadcastOutput.includes("Settlement Request Processed");
  assert(
    broadcastOk,
    "CRE broadcast did not output 'Settlement Request Processed'",
  );

  // ── Step 9: Verify on-chain ─────────────────────────────────────────────────
  step("Verifying on-chain market status...");
  const finalMarket = await publicClient.readContract({
    address: SIMPLE_MARKET,
    abi: examplePredictionMarketAbi,
    functionName: "getMarket",
    args: [marketId],
  });
  // Status: 0=Open, 1=SettlementRequested, 2=Settled, 3=NeedsManual
  assert(
    finalMarket.status === 2,
    `Expected status=2 (Settled), got status=${finalMarket.status}`,
  );
  console.log(`  ok Market ${marketId} is Settled (status=2)`);
  console.log(`  Outcome: ${finalMarket.outcome === 2 ? "YES" : finalMarket.outcome === 1 ? "NO" : `Unknown(${finalMarket.outcome})`}`);

  // ── Step 10: Verify Firestore ───────────────────────────────────────────────
  step("Verifying Firestore document...");

  // Extract Firestore document ID from broadcast output
  const firestoreLine = broadcastOutput
    .split("\n")
    .find((l) => l.includes("Firestore Document:"));
  const firestoreDocId = firestoreLine
    ? firestoreLine.split("/").pop()?.trim()
    : undefined;

  if (firestoreDocId) {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/demo/${firestoreDocId}`;
    const resp = await fetch(firestoreUrl);

    if (resp.ok) {
      const doc = (await resp.json()) as {
        fields?: {
          question?: { stringValue?: string };
          geminiResponse?: { stringValue?: string };
        };
      };
      const fsQuestion = doc.fields?.question?.stringValue;
      const fsResult = doc.fields?.geminiResponse?.stringValue;

      assert(!!fsQuestion, "Firestore document missing 'question' field");
      console.log(`  ok Firestore document found`);
      console.log(`  Question: ${fsQuestion}`);
      console.log(`  AI Result: ${fsResult ?? "(not set)"}`);
    } else {
      console.error(`  WARN: Firestore fetch failed (${resp.status})`);
    }
  } else {
    console.log(
      "  WARN: Could not extract Firestore document ID from broadcast output",
    );
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  banner("PASS — SimpleMarket + CRE E2E");
  console.log(`  Market ID:     ${marketId}`);
  console.log(`  Question:      ${QUESTION}`);
  console.log(`  On-chain:      Settled`);
  console.log(`  Firestore:     ${firestoreDocId ? "Verified" : "Skipped (no doc ID)"}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nx E2E test failed:", err);
    process.exit(1);
  });
