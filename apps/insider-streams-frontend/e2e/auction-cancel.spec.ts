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
} from "@private-streams/common";
import { test, expect, TEST_ACCOUNTS } from "./fixtures";
import { createTestAuction } from "./helpers";
import type { TestState } from "./global-setup";

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

test.describe("Auction cancel", () => {
  test("cancelled auction shows Cancelled status on auction page", async ({
    page,
  }) => {
    const state = getTestState();
    const ownerPk = process.env.OWNER_PK;
    if (!ownerPk) {
      test.skip(true, "OWNER_PK not set — cannot cancel auctions");
      return;
    }

    // Step 1: Create a fresh auction via daemon API
    const viewerAccount = privateKeyToAccount(TEST_ACCOUNTS.viewer);
    console.log("[cancel] Creating auction to cancel...");
    const result = await createTestAuction(viewerAccount, {
      eventId: state.eventId,
      eventTitle: state.eventTitle,
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
