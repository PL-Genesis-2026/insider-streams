/**
 * Outbid E2E test.
 *
 * Uses bidder2's wallet to place a higher bid on the same auction
 * that bidder1 already bid on. Verifies the new bid succeeds.
 *
 * Runs after auction-lifecycle.spec.ts (alphabetical order).
 */
import { test, expect, TEST_ACCOUNTS } from "./fixtures";
import { readTestState, findOpenAuctions } from "./helpers";

test.use({ walletPrivateKey: TEST_ACCOUNTS.bidder2 });

test.describe("Outbid flow", () => {
  test("outbid the current leader with a higher bid", async ({ page }) => {
    const state = readTestState();
    let auctionId = state?.bidAuctionId || null;

    if (!auctionId) {
      console.log("[outbid] No test state, querying subgraph for open auction...");
      const auctions = await findOpenAuctions(20, 600);
      auctionId = auctions[0]?.auctionId ?? null;
    }

    if (!auctionId) {
      test.skip(true, "No open auction found");
      return;
    }

    console.log(`[outbid] Using auction #${auctionId}`);

    await page.goto(`/auction/${auctionId}`);

    // Wait for auction page to load
    await expect(
      page.getByText(`#${auctionId}`).first(),
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

      // Balance may still be loading (FHE decrypt via daemon)
      const loadingButton = page.getByRole("button", { name: "Loading balance" });
      const isLoading = await loadingButton.isVisible().catch(() => false);
      if (isLoading) throw new Error("STILL_LOADING");

      const needsDeposit = await depositLink.isVisible().catch(() => false);
      if (needsDeposit) throw new Error("NEEDS_DEPOSIT");

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

    // Fill higher bid amount — $200 USDC (above any existing bid)
    const bidAmountInput = page.locator("#bid-amount");
    await expect(bidAmountInput).toBeVisible({ timeout: 10_000 });
    await bidAmountInput.fill("200");

    // Submit
    const modalSubmit = page
      .locator('[role="dialog"]')
      .getByRole("button", { name: "Place Bid" });
    await expect(modalSubmit).toBeEnabled({ timeout: 5_000 });
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
