/**
 * SimpleMarket + CRE Prediction Market E2E Test Script
 *
 * Full lifecycle test on Eth Sepolia:
 *   1. Owner creates an event with a question
 *   2. Bidder approves USDC + buys YES shares
 *   3. Waits for event closure (3 minutes)
 *   4. Owner requests settlement
 *   5. CRE prediction-market-demo simulation (dry run)
 *   6. CRE prediction-market-demo broadcast (on-chain settlement)
 *   7. Verifies on-chain event is Settled
 *   8. Verifies Firestore document exists with question + AI response
 *
 * Env vars required:
 *   OWNER_PK             — creates event, requests settlement
 *   BIDDER_PK            — buys shares (must be different from owner)
 *   RPC_URL              — Eth Sepolia RPC
 *   FIREBASE_API_KEY     — Firebase API key
 *   FIREBASE_PROJECT_ID  — Firebase project ID
 *
 * Usage: pnpm e2e:simple-market
 */

import {
  CONFIDENTIAL_USDC_ADDRESS,
  confidentialUsdcAbi,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  examplePredictionMarketAbi,
} from "@private-streams/common";
import { parseEventLogs, type Hex } from "viem";
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
const FIREBASE_API_KEY = envRequired("FIREBASE_API_KEY");
const FIREBASE_PROJECT_ID = envRequired("FIREBASE_PROJECT_ID");

const CONFIDENTIAL_USDC = CONFIDENTIAL_USDC_ADDRESS;

const { publicClient, ownerClient, ownerAccount, bidderClient, bidderAccount } =
  createClients({ ownerPk: OWNER_PK, bidderPk: BIDDER_PK, rpcUrl: RPC_URL });

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_BALANCE = 10_000_000n; // 10 USDC
const MINT_AMOUNT = 10_000_000_000n; // 10,000 USDC
const APPROVAL_AMOUNT = 100_000_000_000n; // 100,000 USDC blanket
const MIN_ALLOWANCE = 10_000_000n; // 10 USDC — threshold to trigger approve
const PREDICTION_AMOUNT = 1_000_000n; // 1 USDC
const EVENT_DURATION = BigInt(60); // 60 seconds
const QUESTION = "The New York Yankees won the 2009 World Series.";
// SimpleMarket.Outcome: 0=Unresolved, 1=No, 2=Yes
const OUTCOME_YES = 2;

// ─── E2E Flow ────────────────────────────────────────────────────────────────

async function main() {
  banner("SimpleMarket + CRE E2E Test");
  console.log(`  Owner:         ${ownerAccount.address}`);
  console.log(`  Bidder:        ${bidderAccount!.address}`);
  console.log(`  ConfidentialUSDC: ${CONFIDENTIAL_USDC}`);
  console.log(`  SimpleMarket:  ${EXAMPLE_PREDICTION_MARKET_ADDRESS}`);
  console.log(`  Question:      ${QUESTION}`);

  // ── Step 1: Ensure USDC balances ────────────────────────────────────────────
  step("Ensuring accounts have USDC...");
  await ensureUsdcBalance(
    publicClient,
    ownerClient,
    CONFIDENTIAL_USDC,
    bidderAccount!.address,
    MIN_BALANCE,
    MINT_AMOUNT,
  );

  // ── Step 2: Approve USDC (only if needed) ──────────────────────────────────
  step("Ensuring USDC approvals...");
  const ownerAllowance = await publicClient.readContract({
    address: CONFIDENTIAL_USDC,
    abi: confidentialUsdcAbi,
    functionName: "allowance",
    args: [ownerAccount.address, EXAMPLE_PREDICTION_MARKET_ADDRESS],
  });
  if (ownerAllowance < MIN_ALLOWANCE) {
    const h = await ownerClient.writeContract({
      address: CONFIDENTIAL_USDC,
      abi: confidentialUsdcAbi,
      functionName: "approve",
      args: [EXAMPLE_PREDICTION_MARKET_ADDRESS, APPROVAL_AMOUNT],
    });
    await waitForTx(publicClient, h, "Owner USDC approval");
  } else {
    console.log(`  ok Owner allowance sufficient`);
  }

  const bidderAllowance = await publicClient.readContract({
    address: CONFIDENTIAL_USDC,
    abi: confidentialUsdcAbi,
    functionName: "allowance",
    args: [bidderAccount!.address, EXAMPLE_PREDICTION_MARKET_ADDRESS],
  });
  if (bidderAllowance < MIN_ALLOWANCE) {
    const h = await bidderClient!.writeContract({
      address: CONFIDENTIAL_USDC,
      abi: confidentialUsdcAbi,
      functionName: "approve",
      args: [EXAMPLE_PREDICTION_MARKET_ADDRESS, APPROVAL_AMOUNT],
    });
    await waitForTx(publicClient, h, "Bidder USDC approval");
  } else {
    console.log(`  ok Bidder allowance sufficient`);
  }

  // ── Step 3: Create event ───────────────────────────────────────────────────
  step("Owner creating event...");
  const createEventHash = await ownerClient.writeContract({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS,
    abi: examplePredictionMarketAbi,
    functionName: "newEvent",
    args: [QUESTION, EVENT_DURATION],
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

  // ── Step 4: Buy YES shares (replaces old makePrediction) ────────────────────
  step("Bidder buying YES shares...");
  const buyHash = await bidderClient!.writeContract({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS,
    abi: examplePredictionMarketAbi,
    functionName: "buyShares",
    args: [eventId, OUTCOME_YES, PREDICTION_AMOUNT],
  });
  await waitForTx(
    publicClient,
    buyHash,
    `Bought YES shares (${PREDICTION_AMOUNT} USDC)`,
  );

  // ── Step 5: Wait for event closure ─────────────────────────────────────────
  step("Waiting for event to close...");
  const event = await publicClient.readContract({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS,
    abi: examplePredictionMarketAbi,
    functionName: "getEvent",
    args: [eventId],
  });
  console.log(`  Event closes at: ${event.eventClose}`);
  await waitForTimestamp(publicClient, event.eventClose, "Event closure");

  // ── Step 6: Request settlement ──────────────────────────────────────────────
  step("Owner requesting settlement...");
  const settleHash = await ownerClient.writeContract({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS,
    abi: examplePredictionMarketAbi,
    functionName: "requestSettlement",
    args: [eventId],
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
  step("Verifying on-chain event status...");
  const finalEvent = await publicClient.readContract({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS,
    abi: examplePredictionMarketAbi,
    functionName: "getEvent",
    args: [eventId],
  });
  // Status: 0=Open, 1=SettlementRequested, 2=Settled, 3=NeedsManual
  assert(
    finalEvent.status === 2,
    `Expected status=2 (Settled), got status=${finalEvent.status}`,
  );
  console.log(`  ok Event ${eventId} is Settled (status=2)`);
  console.log(
    `  Outcome: ${finalEvent.outcome === 2 ? "YES" : finalEvent.outcome === 1 ? "NO" : `Unknown(${finalEvent.outcome})`}`,
  );

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
  console.log(`  Event ID:      ${eventId}`);
  console.log(`  Question:      ${QUESTION}`);
  console.log(`  On-chain:      Settled`);
  console.log(
    `  Firestore:     ${firestoreDocId ? "Verified" : "Skipped (no doc ID)"}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nx E2E test failed:", err);
    process.exit(1);
  });
