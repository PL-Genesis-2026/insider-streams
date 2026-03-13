/**
 * Bid placement E2E test.
 *
 * Navigates to a live auction page, goes through the bid gate
 * (unlock wallet → reveal private data → funded status), places a bid,
 * and verifies the "Bid placed successfully" confirmation.
 *
 * Prerequisites (handled by global-setup.ts or discovered via subgraph):
 * - An auction exists on the FHE marketplace
 * - Bidder1 account has >= 50 USDC deposited
 */
import { test, expect, TEST_ACCOUNTS } from "./fixtures";
import { readTestState, findOpenAuctions } from "./helpers";

test.use({ walletPrivateKey: TEST_ACCOUNTS.bidder1 });

test.describe("Bid placement", () => {
  test("place a bid on an open auction", async ({ page }) => {
    const state = readTestState();
    let auctionId = state?.bidAuctionId || null;

    if (!auctionId) {
      console.log("[bid] No test state, querying subgraph for open auction...");
      const auctions = await findOpenAuctions(20, 600);
      auctionId = auctions[0]?.auctionId ?? null;
    }

    if (!auctionId) {
      test.skip(true, "No open auction found");
      return;
    }

    console.log(`[bid] Using auction #${auctionId}`);

    // Navigate to the auction page — may need to wait for subgraph indexing
    await page.goto(`/auction/${auctionId}`);

    // If auction not found (subgraph not indexed yet), retry after a delay
    const notFound = page.getByText("This page could not be found");
    const isNotFound = await notFound.isVisible({ timeout: 3_000 }).catch(() => false);
    if (isNotFound) {
      console.log("[bid] Auction not indexed yet, waiting 30s and retrying...");
      await page.waitForTimeout(30_000);
      await page.goto(`/auction/${auctionId}`);
    }

    // Verify we're on the auction page
    await expect(
      page.getByText(`#${auctionId}`).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Step 1: Unlock wallet and wait for "Place Bid" to appear.
    // The unlock triggers personal_sign + daemon API calls + funding snapshot.
    // walletClient may not be ready immediately, so retry clicking "Unlock wallet"
    // until the bid gate transitions to funded state.
    const placeBidButton = page.getByRole("button", { name: "Place Bid" });
    const depositLink = page.getByRole("link", {
      name: "Deposit funds to bid",
    });

    await expect(async () => {
      // Click "Unlock wallet" if still visible
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

      // Check if we landed on "not funded" — skip the test
      const needsDeposit = await depositLink.isVisible().catch(() => false);
      if (needsDeposit) throw new Error("NEEDS_DEPOSIT");

      // Assert "Place Bid" is visible
      await expect(placeBidButton).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000, intervals: [5_000] });

    // If deposit link appeared, skip
    const finalNeedsDeposit = await depositLink.isVisible().catch(() => false);
    if (finalNeedsDeposit) {
      test.skip(
        true,
        "Bidder1 not funded — deposit may not have confirmed in time",
      );
      return;
    }

    // Step 3: Click "Place Bid" to open the bid modal
    await placeBidButton.click();

    // Step 4: Fill in bid amount — $100 USDC (high enough to exceed any current bid)
    const bidAmountInput = page.locator("#bid-amount");
    await expect(bidAmountInput).toBeVisible({ timeout: 10_000 });
    await bidAmountInput.fill("100");

    // Step 5: Click submit in the modal dialog
    const modalSubmit = page
      .locator('[role="dialog"]')
      .getByRole("button", { name: "Place Bid" });
    await expect(modalSubmit).toBeEnabled({ timeout: 5_000 });
    await modalSubmit.click();

    // Step 6: Wait for "Bid placed successfully" confirmation
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
      console.log(`[bid] Bid failed: ${errorText}`);
    }

    expect(outcome).toBe("success");
  });
});
