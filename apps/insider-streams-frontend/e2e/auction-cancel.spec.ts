/**
 * Auction cancel E2E test.
 *
 * Creates an auction programmatically, cancels it via direct contract call
 * (admin-only operation), then verifies the frontend shows "Cancelled" status.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  fheSecretMarketplaceAbi,
  SECRET_MARKETPLACE_ADDRESS,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  examplePredictionMarketAbi,
} from "@private-streams/common";
import { test, expect, TEST_ACCOUNTS } from "./fixtures";
import { createTestAuction, readTestState } from "./helpers";

test.use({ walletPrivateKey: TEST_ACCOUNTS.viewer });

// Load env vars for OWNER_PK
function loadEnvFile(path: string) {
  try {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      const value = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // skip
  }
}

const worktreeRoot = resolve(__dirname, "../../../");
const mainRepoRoot = resolve(__dirname, "../../../../../");
for (const root of [worktreeRoot, mainRepoRoot]) {
  loadEnvFile(resolve(root, ".env"));
  loadEnvFile(resolve(root, "scripts/.env"));
}

/** Find a usable prediction market event from the contract. */
async function findUsableEvent(): Promise<{ eventId: string; eventTitle: string } | null> {
  const RPC_URL = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

  const nextEventId = await publicClient.readContract({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
    abi: examplePredictionMarketAbi,
    functionName: "nextEventId",
  });

  for (let i = 0; i < Number(nextEventId); i++) {
    try {
      const event = await publicClient.readContract({
        address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
        abi: examplePredictionMarketAbi,
        functionName: "getMarketEvent",
        args: [BigInt(i)],
      });
      const endTime = Number((event as any)[1] ?? (event as any).endTime);
      const settled = (event as any)[2] ?? (event as any).settled;
      const question = (event as any)[0] ?? (event as any).question;
      if (!settled && endTime > Math.floor(Date.now() / 1000) + 600) {
        return { eventId: String(i), eventTitle: String(question) };
      }
    } catch {
      // skip
    }
  }
  return null;
}

test.describe("Auction cancel", () => {
  test("cancelled auction shows Cancelled status on auction page", async ({
    page,
  }) => {
    const state = readTestState();
    const ownerPk = process.env.OWNER_PK;
    if (!ownerPk) {
      test.skip(true, "OWNER_PK not set — cannot cancel auctions");
      return;
    }

    // Find event info — from test state or on-chain
    let eventId = state?.eventId;
    let eventTitle = state?.eventTitle;
    if (!eventId || !eventTitle) {
      console.log("[cancel] No test state, looking up event from chain...");
      const found = await findUsableEvent();
      if (!found) {
        test.skip(true, "No usable prediction market event on-chain");
        return;
      }
      eventId = found.eventId;
      eventTitle = found.eventTitle;
    }

    // Step 1: Create a fresh auction via daemon API
    const viewerAccount = privateKeyToAccount(TEST_ACCOUNTS.viewer);
    console.log("[cancel] Creating auction to cancel...");
    const result = await createTestAuction(viewerAccount, {
      eventId,
      eventTitle,
      privateLeg: "yes",
      secretPayload: "E2E cancel test secret",
      durationSeconds: 3600,
    });

    const auctionId = String(result.data.auctionId ?? "");
    if (!auctionId || result.status !== 200) {
      test.skip(true, `Auction creation failed: ${JSON.stringify(result.data)}`);
      return;
    }
    console.log(`[cancel] Created auction #${auctionId}`);

    // Step 2: Cancel the auction via direct contract call (admin-only)
    const adminAccount = privateKeyToAccount(ownerPk as `0x${string}`);
    const transport = http();
    const walletClient = createWalletClient({
      account: adminAccount,
      chain: sepolia,
      transport,
    });
    const publicClient = createPublicClient({ chain: sepolia, transport });

    // Verify auction exists on-chain before cancelling.
    // The daemon's createAuction waits for tx receipt, but different RPC nodes
    // may have slight state lag. Retry a few times if needed.
    console.log(`[cancel] Verifying auction #${auctionId} exists on-chain...`);
    let auctionExists = false;
    for (let i = 0; i < 10; i++) {
      try {
        await publicClient.readContract({
          address: SECRET_MARKETPLACE_ADDRESS as Address,
          abi: fheSecretMarketplaceAbi,
          functionName: "getAuction",
          args: [BigInt(auctionId)],
        });
        auctionExists = true;
        break;
      } catch {
        console.log(`[cancel] Auction not found yet (attempt ${i + 1}/10), waiting 5s...`);
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
    if (!auctionExists) {
      test.skip(true, `Auction #${auctionId} not found on-chain after 50s`);
      return;
    }

    console.log(`[cancel] Cancelling auction #${auctionId}...`);
    const cancelHash = await walletClient.writeContract({
      address: SECRET_MARKETPLACE_ADDRESS as Address,
      abi: fheSecretMarketplaceAbi,
      functionName: "cancelAuction",
      args: [BigInt(auctionId)],
    });
    await publicClient.waitForTransactionReceipt({ hash: cancelHash });
    console.log(`[cancel] Cancelled: ${cancelHash}`);

    // Step 3: Wait for subgraph to index, then poll with page reloads
    console.log("[cancel] Waiting for subgraph to index...");

    await expect(async () => {
      await page.goto(`/auction/${auctionId}`);
      await expect(page.getByText(`#${auctionId}`).first()).toBeVisible({
        timeout: 10_000,
      });
      const hasCancelled = await page.getByText("Cancelled").first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      expect(hasCancelled).toBe(true);
    }).toPass({ timeout: 120_000, intervals: [15_000] });
  });
});
