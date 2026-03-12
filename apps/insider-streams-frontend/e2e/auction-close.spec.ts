/**
 * Auction close E2E test.
 *
 * Uses the short-duration auction created by global setup (5 min).
 * Waits for it to expire, closes it via direct contract call,
 * then verifies the frontend shows "Closed" status.
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
} from "@private-streams/common";
import { test, expect, TEST_ACCOUNTS } from "./fixtures";
import type { TestState } from "./global-setup";

// Increase timeout — this test may wait for auction to expire
test.setTimeout(600_000); // 10 min

test.use({ walletPrivateKey: TEST_ACCOUNTS.viewer });

function getTestState(): TestState {
  return JSON.parse(
    readFileSync(resolve(__dirname, ".test-state.json"), "utf-8"),
  );
}

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

test.describe("Auction close", () => {
  test("closed auction shows Closed status on auction page", async ({
    page,
  }) => {
    const state = getTestState();
    const ownerPk = process.env.OWNER_PK;

    if (!ownerPk) {
      test.skip(true, "OWNER_PK not set — cannot close auctions");
      return;
    }
    if (!state.closeAuctionId) {
      test.skip(true, "No close auction created in global setup");
      return;
    }

    const adminAccount = privateKeyToAccount(ownerPk as `0x${string}`);
    const transport = http();
    const publicClient = createPublicClient({ chain: sepolia, transport });
    const walletClient = createWalletClient({
      account: adminAccount,
      chain: sepolia,
      transport,
    });
    const marketplaceAddress = SECRET_MARKETPLACE_ADDRESS as Address;

    // Step 1: Wait for the auction to expire
    console.log(
      `[close] Checking auction #${state.closeAuctionId} expiry...`,
    );

    const auction = await publicClient.readContract({
      address: marketplaceAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "getAuction",
      args: [BigInt(state.closeAuctionId)],
    });
    const endTime = Number((auction as any)[1]);
    const now = Math.floor(Date.now() / 1000);

    if (endTime > now) {
      const waitSec = endTime - now + 30; // 30s buffer for block timestamp lag
      console.log(
        `[close] Auction expires in ${waitSec}s, waiting...`,
      );
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }

    // Step 2: Close the auction via direct contract call (retry on AuctionNotEnded)
    console.log(`[close] Closing auction #${state.closeAuctionId}...`);
    let closeHash: `0x${string}` | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        closeHash = await walletClient.writeContract({
          address: marketplaceAddress,
          abi: fheSecretMarketplaceAbi,
          functionName: "closeAuction",
          args: [BigInt(state.closeAuctionId)],
        });
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("AuctionNotEnded") && attempt < 4) {
          console.log(`[close] AuctionNotEnded — block timestamp lag, retrying in 15s...`);
          await new Promise((r) => setTimeout(r, 15_000));
          continue;
        }
        throw err;
      }
    }
    if (!closeHash) throw new Error("Failed to close auction after retries");
    await publicClient.waitForTransactionReceipt({ hash: closeHash });
    console.log(`[close] Closed: ${closeHash}`);

    // Step 3: Wait for subgraph to index, then poll with page reloads
    console.log("[close] Waiting for subgraph to index...");

    // Poll: reload the auction page until "Closed" appears or timeout
    await expect(async () => {
      await page.goto(`/auction/${state.closeAuctionId}`);
      await expect(page.getByText(`#${state.closeAuctionId}`).first()).toBeVisible(
        { timeout: 10_000 },
      );
      // Check for either "Closed" badge or "Auction closed" timeline text
      const hasClosed = await page.getByText("Closed").first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      const hasTimeline = await page.getByText("Auction closed").first()
        .isVisible({ timeout: 2_000 })
        .catch(() => false);
      expect(hasClosed || hasTimeline).toBe(true);
    }).toPass({ timeout: 180_000, intervals: [15_000] });
  });
});
