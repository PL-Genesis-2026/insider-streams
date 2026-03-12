/**
 * Outbid E2E test.
 *
 * Uses bidder2's wallet to place a higher bid on the same auction
 * that bidder1 already bid on. Verifies the new bid succeeds.
 *
 * Runs after auction-lifecycle.spec.ts (alphabetical order).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, TEST_ACCOUNTS } from "./fixtures";
import type { TestState } from "./global-setup";

test.use({ walletPrivateKey: TEST_ACCOUNTS.bidder2 });

function getTestState(): TestState {
  return JSON.parse(
    readFileSync(resolve(__dirname, ".test-state.json"), "utf-8"),
  );
}

test.describe("Outbid flow", () => {
  test("outbid the current leader with a higher bid", async ({ page }) => {
    const state = getTestState();
    if (!state.bidAuctionId) {
      test.skip(true, "No bid auction created in global setup");
      return;
    }

    await page.goto(`/auction/${state.bidAuctionId}`);

    // Wait for auction page to load
    await expect(
      page.getByText(`#${state.bidAuctionId}`).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Unlock wallet and wait for "Place Bid" to appear.
    // walletClient may not be ready immediately, so retry clicking.
    const placeBidButton = page.getByRole("button", { name: "Place Bid" });
    const depositLink = page.getByRole("link", {
      name: "Deposit funds to bid",
    });

    await expect(async () => {
      const unlockButton = page.getByRole("button", { name: "Unlock wallet" });
      const unlockVisible = await unlockButton.isVisible().catch(() => false);
      if (unlockVisible) {
        await unlockButton.click();
        await page.waitForTimeout(3_000);
      }

      const needsDeposit = await depositLink.isVisible().catch(() => false);
      if (needsDeposit) {
        throw new Error("NEEDS_DEPOSIT");
      }

      await expect(placeBidButton).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000, intervals: [5_000] });

    const finalNeedsDeposit = await depositLink.isVisible().catch(() => false);
    if (finalNeedsDeposit) {
      test.skip(
        true,
        "Bidder2 not funded — deposit may not have confirmed in time",
      );
      return;
    }

    // Open bid modal
    await placeBidButton.click();

    // Fill higher bid amount — $10 USDC (above bidder1's $5)
    const bidAmountInput = page.locator("#bid-amount");
    await expect(bidAmountInput).toBeVisible();
    await bidAmountInput.fill("10");

    // Submit
    const modalSubmit = page
      .locator('[role="dialog"]')
      .getByRole("button", { name: "Place Bid" });
    await expect(modalSubmit).toBeEnabled();
    await modalSubmit.click();

    // Wait for confirmation
    const outcome = await Promise.race([
      page
        .getByText("Bid placed successfully")
        .waitFor({ timeout: 60_000 })
        .then(() => "success" as const),
      page
        .locator('[role="dialog"]')
        .getByText(/failed|error/i)
        .waitFor({ timeout: 60_000 })
        .then(() => "error" as const),
    ]);

    if (outcome === "error") {
      const errorText = await page
        .locator('[role="dialog"] .text-destructive')
        .first()
        .textContent();
      console.log(`[outbid] Bid failed: ${errorText}`);
    }

    expect(outcome).toBe("success");
  });
});
