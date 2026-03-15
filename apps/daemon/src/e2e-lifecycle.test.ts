/**
 * Full Lifecycle E2E Test (Sepolia)
 *
 * Tests the complete create→deposit→bid→close→settle→resolve pipeline
 * through the daemon API and direct on-chain admin calls.
 *
 * This is the integration test that verifies ExamplePredictionMarket ↔
 * FHESecretMarketplace coordination through the daemon.
 *
 * Requires:
 *   - PRIVATE_KEY (contract owner) in daemon .env
 *   - Sepolia ETH balance on owner account
 *   - Real Zama FHE relayer (Sepolia)
 *
 * Usage: cd apps/daemon && pnpm test:lifecycle
 */

import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createPublicClient,
  createWalletClient,
  http,
  zeroHash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import stringify from "fast-json-stable-stringify";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";
import {
  examplePredictionMarketAbi,
  fheSecretMarketplaceAbi,
  mockUsdcAbi,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  SECRET_MARKETPLACE_ADDRESS,
  MOCK_USDC_ADDRESS,
} from "@private-streams/common";

// ── Config ──────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const OWNER_PK = process.env.PRIVATE_KEY as Hex;
const API_PORT = 3098; // Different from other test suites
const BASE_URL = `http://localhost:${API_PORT}`;

// Test accounts — these sign requests to the daemon API
const SELLER_PK = "0xe38e78bfd13899c54453206eeb5e173fa917b5e5f42000bf0523e5763424f5a8" as Hex;
const BIDDER_PK = "0x9d2db6cbff6b835d650c80b478c6884d478b4306d664b9fa368f644d07631897" as Hex;

const SELLER = privateKeyToAccount(SELLER_PK);
const BIDDER = privateKeyToAccount(BIDDER_PK);

const pmAddress = EXAMPLE_PREDICTION_MARKET_ADDRESS as `0x${string}`;
const mpAddress = SECRET_MARKETPLACE_ADDRESS as `0x${string}`;
const usdcAddress = MOCK_USDC_ADDRESS as `0x${string}`;

// ── Viem clients for direct on-chain calls (admin actions) ──────────────────

const transport = http(RPC_URL);
const publicClient = createPublicClient({ chain: sepolia, transport });

function getOwnerWallet() {
  return createWalletClient({
    account: privateKeyToAccount(OWNER_PK),
    chain: sepolia,
    transport,
  });
}

// ── HTTP/signing helpers ────────────────────────────────────────────────────

async function signPayload(
  account: ReturnType<typeof privateKeyToAccount>,
  fields: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = { ...fields, timestamp };
  const message = stringify(payload);
  const signature = await account.signMessage({ message });
  return { ...payload, signature };
}

async function signedPost(
  path: string,
  account: ReturnType<typeof privateKeyToAccount>,
  fields: Record<string, unknown> = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const body = await signPayload(account, fields);
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await resp.json()) as Record<string, unknown>;
  return { status: resp.status, data };
}

// ── On-chain helpers ────────────────────────────────────────────────────────

async function waitForTx(hash: Hex, label: string) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success", `${label} tx should succeed`);
  console.log(`  ok ${label} (tx: ${hash.slice(0, 14)}...)`);
  return receipt;
}

// ── Server lifecycle ────────────────────────────────────────────────────────

let serverProcess: ChildProcess | null = null;
let tmpDir: string;
let dbPath: string;

async function waitForServer(maxMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const resp = await fetch(`${BASE_URL}/health`);
      if (resp.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server did not start within ${maxMs}ms`);
}

function cleanupDb() {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { unlinkSync(`${dbPath}${suffix}`); } catch { /* */ }
  }
  try { rmdirSync(tmpDir); } catch { /* */ }
}

// ── Shared test state ───────────────────────────────────────────────────────

let eventId: bigint;
let auctionId: string;
const QUESTION = `[E2E Lifecycle] Test ${Date.now()}`;
const BID_AMOUNT = "2000000"; // 2 USDC
const DEPOSIT_AMOUNT = "10000000"; // 10 USDC

// ── Tests ───────────────────────────────────────────────────────────────────

before(async function () {
  if (!OWNER_PK) {
    console.warn("PRIVATE_KEY not set — skipping lifecycle test");
    process.exit(0);
  }

  tmpDir = mkdtempSync(join(tmpdir(), "daemon-lifecycle-"));
  dbPath = join(tmpDir, "lifecycle.db");

  // Spawn daemon with the real owner PK (so on-chain FHE txs are authorized)
  serverProcess = spawn("npx", ["tsx", "src/api.ts"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: {
      ...process.env,
      API_PORT: String(API_PORT),
      DB_PATH: dbPath,
      PRIVATE_KEY: OWNER_PK,
    },
    stdio: "pipe",
  });

  serverProcess.stdout?.on("data", (d: Buffer) => {
    const msg = d.toString().trim();
    if (msg) console.log(`[daemon] ${msg}`);
  });
  serverProcess.stderr?.on("data", (d: Buffer) => {
    const msg = d.toString().trim();
    if (msg && !msg.includes("npm warn")) console.error(`[daemon] ${msg}`);
  });

  await waitForServer();
  console.log(`[lifecycle] Daemon running on port ${API_PORT}, db: ${dbPath}`);
});

after(() => {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
  cleanupDb();
});

describe("Full Lifecycle E2E", { timeout: 600_000 }, () => {
  it("Step 1: Create prediction market event on-chain", async () => {
    const wallet = getOwnerWallet();

    // Ensure owner has MockUSDC for event liquidity
    const balance = await publicClient.readContract({
      address: usdcAddress,
      abi: mockUsdcAbi,
      functionName: "balanceOf",
      args: [wallet.account.address],
    });

    const initialLiquidity = await publicClient.readContract({
      address: pmAddress,
      abi: examplePredictionMarketAbi,
      functionName: "INITIAL_LIQUIDITY",
    });

    if ((balance as bigint) < (initialLiquidity as bigint)) {
      const mintHash = await wallet.writeContract({
        address: usdcAddress,
        abi: mockUsdcAbi,
        functionName: "mint",
        args: [wallet.account.address, 100_000_000n], // 100 USDC
      });
      await waitForTx(mintHash, "Mint MockUSDC");
    }

    // Approve PM for MockUSDC
    const allowance = await publicClient.readContract({
      address: usdcAddress,
      abi: mockUsdcAbi,
      functionName: "allowance",
      args: [wallet.account.address, pmAddress],
    });
    if ((allowance as bigint) < (initialLiquidity as bigint)) {
      const approveHash = await wallet.writeContract({
        address: usdcAddress,
        abi: mockUsdcAbi,
        functionName: "approve",
        args: [pmAddress, 1_000_000_000n],
      });
      await waitForTx(approveHash, "Approve PM");
    }

    // Create event with 2h duration
    const hash = await wallet.writeContract({
      address: pmAddress,
      abi: examplePredictionMarketAbi,
      functionName: "newEvent",
      args: [QUESTION, 7200n],
    });
    const receipt = await waitForTx(hash, "Create event");

    // Parse EventCreated to get eventId
    const { decodeEventLog } = await import("viem");
    let foundEventId: bigint | null = null;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: examplePredictionMarketAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "EventCreated") {
          foundEventId = (decoded.args as { eventId: bigint }).eventId;
          break;
        }
      } catch { /* not our event */ }
    }
    assert.ok(foundEventId !== null, "Should have EventCreated event");
    eventId = foundEventId!;
    console.log(`  Event ID: ${eventId}`);
    assert.ok(eventId >= 0n, "Event ID should be non-negative");
  });

  it("Step 2: Deposit funds for bidder via daemon API", async () => {
    const result = await signedPost("/deposit", BIDDER, {
      amount: DEPOSIT_AMOUNT,
    });

    console.log(`  Deposit response: ${JSON.stringify(result.data)}`);
    assert.equal(result.status, 200, "Deposit should return 200");
    assert.equal(result.data.status, "pending", "Deposit should be pending");

    // Wait for the FHE tx to confirm (daemon submits async)
    console.log("  Waiting 30s for deposit FHE tx to confirm...");
    await new Promise((r) => setTimeout(r, 30_000));
  });

  it("Step 3: Create auction via daemon API", async () => {
    const endTime = String(Math.floor(Date.now() / 1000) + 300); // 5 min
    const result = await signedPost("/create-auction", SELLER, {
      eventId: String(eventId),
      eventTitle: QUESTION,
      endTime,
      prediction: "true",
      secretPayload: "E2E lifecycle secret prediction data",
    });

    console.log(`  Create auction response: ${JSON.stringify(result.data)}`);
    assert.equal(result.status, 200, "Create auction should return 200");
    assert.ok(result.data.success, "Auction creation should succeed");
    assert.ok(result.data.auctionId, "Should return auctionId");
    assert.ok(result.data.txHash, "Should return txHash");
    auctionId = result.data.auctionId as string;
    console.log(`  Auction ID: ${auctionId}`);
  });

  it("Step 4: Place bid via daemon API", async () => {
    const result = await signedPost("/bid", BIDDER, {
      auctionId,
      amount: BID_AMOUNT,
    });

    console.log(`  Bid response: ${JSON.stringify(result.data)}`);
    assert.equal(result.status, 200, "Bid should return 200");
    assert.equal(result.data.status, "recorded", "Bid should be recorded");
    assert.ok(result.data.bidId, "Should return bidId");

    // Wait for the FHE tx to confirm
    console.log("  Waiting 30s for bid FHE tx to confirm...");
    await new Promise((r) => setTimeout(r, 30_000));
  });

  it("Step 5: Admin expire + close auction on-chain", async () => {
    const wallet = getOwnerWallet();
    const id = BigInt(auctionId);

    // Admin expire (sets endTime to now)
    const expireHash = await wallet.writeContract({
      address: mpAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "adminExpireAuction",
      args: [id],
    });
    await waitForTx(expireHash, "Admin expire auction");

    // Close auction
    const closeHash = await wallet.writeContract({
      address: mpAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "closeAuction",
      args: [id],
    });
    await waitForTx(closeHash, "Close auction");

    // Verify auction is closed
    // getAuction returns: [sellerId, endTime, currentBid, currentBidderId,
    //   eventId, eventTitle, status, reputationResolved, secretDataCid, currentBidPlaintext]
    const [, , , , , , auctionStatus] = await publicClient.readContract({
      address: mpAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "getAuction",
      args: [id],
    });
    // AuctionStatus: 0=Open, 1=Closed, 2=Cancelled
    assert.equal(auctionStatus, 1, "Auction should be Closed (status=1)");
    console.log(`  Auction status: ${auctionStatus} (Closed)`);
  });

  it("Step 6: Force-settle prediction market event on-chain", async () => {
    const wallet = getOwnerWallet();

    // ForceSettle with outcome YES (2), high confidence, evidence URI
    const hash = await wallet.writeContract({
      address: pmAddress,
      abi: examplePredictionMarketAbi,
      functionName: "forceSettle",
      args: [
        eventId,
        2, // Outcome.Yes
        9500, // 95% confidence
        "e2e-lifecycle-test",
      ],
    });
    await waitForTx(hash, "Force settle event");

    // Verify event is settled
    const marketEvent = await publicClient.readContract({
      address: pmAddress,
      abi: examplePredictionMarketAbi,
      functionName: "getMarketEvent",
      args: [eventId],
    });
    // Status enum: Open=0, SettlementRequested=1, Settled=2, NeedsManual=3
    assert.equal(marketEvent.status, 2, "Event should be Settled (status=2)");
    console.log(`  Event status: ${marketEvent.status} (Settled)`);
  });

  it("Step 7: Resolve event predictions on marketplace on-chain", async () => {
    const wallet = getOwnerWallet();

    // Check not already resolved
    const alreadyResolved = await publicClient.readContract({
      address: mpAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "eventResolved",
      args: [eventId],
    });
    assert.equal(alreadyResolved, false, "Event should not be resolved yet");

    // Resolve: outcome is YES (true) — matches the forceSettle(Outcome.Yes)
    const hash = await wallet.writeContract({
      address: mpAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "resolveEventPredictions",
      args: [eventId, true],
    });
    await waitForTx(hash, "Resolve event predictions");

    // Verify resolved
    const resolved = await publicClient.readContract({
      address: mpAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "eventResolved",
      args: [eventId],
    });
    assert.equal(resolved, true, "Event should be resolved");
    console.log(`  Event resolved: ${resolved}`);
  });

  it("Step 7.5: Finalize reputation via relayer decrypt + on-chain proof", async () => {
    const wallet = getOwnerWallet();
    const id = BigInt(auctionId);

    // Verify pending reputation decrypt is set
    const pending = await publicClient.readContract({
      address: mpAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "pendingReputationDecrypt",
      args: [id],
    });
    assert.equal(pending, true, "Should have pending reputation decrypt");

    // Read the encrypted handle
    const handle = await publicClient.readContract({
      address: mpAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "pendingIsCorrectHandle",
      args: [id],
    }) as `0x${string}`;
    assert.notEqual(handle, zeroHash, "Handle should not be zero");
    console.log(`  Reputation handle: ${handle}`);

    // Decrypt via Zama Relayer
    console.log("  Initializing FhevmInstance for reputation decrypt...");
    const fhevmInstance = await createInstance({
      ...SepoliaConfig,
      network: RPC_URL,
    });
    console.log("  Calling publicDecrypt...");
    const decryptResult = await fhevmInstance.publicDecrypt([handle]);
    const predictionWasCorrect = Boolean(decryptResult.clearValues[handle]);
    console.log(`  Decrypted: predictionWasCorrect=${predictionWasCorrect}`);

    // Seller predicted YES, outcome was YES → should be correct
    assert.equal(predictionWasCorrect, true, "Prediction should be correct (YES matched YES)");

    // Submit finalization on-chain with proof
    const finalizeHash = await wallet.writeContract({
      address: mpAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "finalizeReputationResult",
      args: [id, predictionWasCorrect, decryptResult.decryptionProof],
    });
    await waitForTx(finalizeHash, "Finalize reputation result");

    // Verify pending flag cleared
    const pendingAfter = await publicClient.readContract({
      address: mpAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "pendingReputationDecrypt",
      args: [id],
    });
    assert.equal(pendingAfter, false, "Pending flag should be cleared");

    // Read sellerId from auction, then verify on-chain reputation score
    const [sellerId] = await publicClient.readContract({
      address: mpAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "getAuction",
      args: [id],
    });
    const seller = await publicClient.readContract({
      address: mpAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "getSeller",
      args: [sellerId],
    });
    console.log(`  On-chain seller (${sellerId}): score=${seller.reputationScore}`);
    assert.ok(Number(seller.reputationScore) >= 1, "On-chain reputation score should be >= 1");
  });

  it("Step 8: Verify seller reputation via daemon API", async () => {
    const result = await signedPost("/seller", SELLER);

    console.log(`  Seller response: ${JSON.stringify(result.data)}`);
    assert.equal(result.status, 200);
    assert.equal(result.data.isSeller, true, "Seller should be registered");
    assert.ok(result.data.userId, "Should have userId");
    // Seller predicted YES, outcome was YES → should have positive reputation
    const score = Number(result.data.reputationScore);
    console.log(`  Reputation score: ${score}`);
    assert.ok(score >= 1, "Reputation score should be >= 1 (correct prediction)");
  });

  it("Step 9: Verify bidder bids via daemon API", async () => {
    const result = await signedPost("/bids", BIDDER);

    console.log(`  Bids response: ${JSON.stringify(result.data)}`);
    assert.equal(result.status, 200);
    const bids = result.data.bids as Array<Record<string, unknown>>;
    assert.ok(bids.length >= 1, "Should have at least 1 bid");

    const ourBid = bids.find((b) => String(b.auctionId) === auctionId);
    assert.ok(ourBid, "Should find our bid for this auction");
    assert.equal(ourBid.amount, BID_AMOUNT, "Bid amount should match");
    console.log(`  Bid status: ${ourBid.status}`);
  });

  it("Step 10: Verify secrets accessible to seller", async () => {
    const result = await signedPost("/secrets", SELLER, {
      auctionIds: [Number(auctionId)],
    });

    console.log(`  Secrets response: ${JSON.stringify(result.data)}`);
    assert.equal(result.status, 200);
    const secrets = result.data.secrets as Array<Record<string, unknown>>;
    assert.equal(secrets.length, 1, "Should have 1 secret");
    assert.equal(secrets[0].hasAccess, true, "Seller should have access");
    assert.ok(secrets[0].secretDataKey, "Secret key should be present");
    assert.ok(secrets[0].secretDataCid, "Secret CID should be present");
  });
});
