/**
 * Outbid E2E test.
 *
 * Uses bidder2's wallet to place a bid on an open auction.
 * Finds an auction where bidder2 can afford to bid.
 *
 * Runs after auction-lifecycle.spec.ts (alphabetical order).
 */
import { test, expect, TEST_ACCOUNTS } from "./fixtures";
import { findOpenAuctions, signedDaemonRequest } from "./helpers";
import { privateKeyToAccount } from "viem/accounts";

test.use({ walletPrivateKey: TEST_ACCOUNTS.bidder2 });

test.describe("Outbid flow", () => {
  test("place a bid with bidder2", async ({ page }) => {
    // Find an open auction with enough time remaining
    const auctions = await findOpenAuctions(20, 600);
    const auctionId = auctions[0]?.auctionId ?? null;

    if (!auctionId) {
      test.skip(true, "No open auction found with 10+ min remaining");
      return;
    }

    // Check bidder2's balance to determine bid amount
    const bidder2 = privateKeyToAccount(TEST_ACCOUNTS.bidder2);
    const { data: balData } = await signedDaemonRequest("/balance", bidder2, {}, 30_000);
    const balanceUsdc = Number(BigInt((balData as Record<string, string>).balance ?? "0")) / 1e6;
    console.log(`[outbid] Bidder2 balance: $${balanceUsdc}`);

    if (balanceUsdc < 10) {
      test.skip(true, `Bidder2 balance too low: $${balanceUsdc}`);
      return;
    }

    console.log(`[outbid] Using auction #${auctionId}`);

    await page.goto(`/auction/${auctionId}`);

    // Wait for auction page to load
    await expect(
      page.getByText(`#${auctionId}`).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Unlock wallet and wait for "Place Bid" to appear
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

      const loadingButton = page.getByRole("button", { name: "Loading balance" });
      const isLoading = await loadingButton.isVisible().catch(() => false);
      if (isLoading) throw new Error("STILL_LOADING");

      const needsDeposit = await depositLink.isVisible().catch(() => false);
      if (needsDeposit) throw new Error("NEEDS_DEPOSIT");

      await expect(placeBidButton).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000, intervals: [5_000] });

    const finalNeedsDeposit = await depositLink.isVisible().catch(() => false);
    if (finalNeedsDeposit) {
      test.skip(true, "Bidder2 not funded");
      return;
    }

    // Open bid modal
    await placeBidButton.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Check current bid and available balance from modal
    const availableText = await dialog
      .getByText(/available/i)
      .first()
      .textContent()
      .catch(() => "");
    console.log(`[outbid] Modal shows: ${availableText}`);

    const currentBidText = await dialog
      .getByText(/current bid|no bids/i)
      .first()
      .textContent()
      .catch(() => "");
    console.log(`[outbid] ${currentBidText}`);

    // Parse current bid to determine minimum bid (+$1)
    const currentBidMatch = currentBidText?.match(/\$(\d+)/);
    const currentBid = currentBidMatch ? Number(currentBidMatch[1]) : 0;
    const minBid = currentBid + 1;

    // Bid minimum needed to outbid, but within balance
    const bidAmount = Math.min(minBid, Math.floor(balanceUsdc));
    if (bidAmount > balanceUsdc) {
      test.skip(true, `Need $${minBid} to outbid but only have $${balanceUsdc}`);
      return;
    }
    console.log(`[outbid] Bidding $${bidAmount} (current: $${currentBid}, min: $${minBid})`);

    const bidAmountInput = page.locator("#bid-amount");
    await expect(bidAmountInput).toBeVisible({ timeout: 10_000 });
    await bidAmountInput.fill(String(bidAmount));

    // Submit
    const modalSubmit = dialog.getByRole("button", { name: "Place Bid" });
    await expect(modalSubmit).toBeEnabled({ timeout: 5_000 });
    await modalSubmit.click();

    // Wait for confirmation
    const outcome = await Promise.race([
      page
        .getByText("Bid placed successfully")
        .waitFor({ timeout: 60_000 })
        .then(() => "success" as const),
      dialog
        .locator(".text-destructive")
        .first()
        .waitFor({ timeout: 60_000 })
        .then(() => "error" as const),
    ]).catch(() => "timeout" as const);

    if (outcome === "error") {
      const errorText = await dialog
        .locator(".text-destructive")
        .first()
        .textContent();
      console.log(`[outbid] Bid failed: ${errorText}`);
    }

    if (outcome === "timeout") {
      await page.screenshot({
        path: "test-results/outbid-timeout.png",
        fullPage: true,
      });
    }

    expect(outcome).toBe("success");
  });
});
