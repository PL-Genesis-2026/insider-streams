/**
 * Self-bid block E2E test.
 *
 * Verifies that a seller cannot bid on their own auction.
 * Uses the createAuction test account (which created the test auctions in
 * global-setup) and navigates to one of those auctions.
 *
 * The "Place Bid" button should be disabled with a tooltip saying
 * "You cannot bid on your own auction".
 */
import { test, expect, TEST_ACCOUNTS } from "./fixtures";
import { readTestState, findOpenAuctions, signedDaemonRequest } from "./helpers";
import { privateKeyToAccount } from "viem/accounts";

// Use the same account that created the auctions in global-setup
test.use({ walletPrivateKey: TEST_ACCOUNTS.createAuction });

test.describe("Self-bid block", () => {
  test("seller cannot bid on own auction", async ({ page }) => {
    const state = readTestState();
    let auctionId = state?.bidAuctionId || null;

    if (!auctionId) {
      // Find an auction created by the createAuction account
      const account = privateKeyToAccount(TEST_ACCOUNTS.createAuction);
      const sellerRes = await signedDaemonRequest("/seller", account);
      const sellerId = sellerRes.data.userId as string | null;

      if (sellerId) {
        const auctions = await findOpenAuctions(50, 0);
        const own = auctions.find((a) => a.sellerId === sellerId);
        auctionId = own?.auctionId ?? null;
      }
    }

    if (!auctionId) {
      test.skip(true, "No auction found for createAuction account");
      return;
    }

    console.log(`[self-bid] Using auction #${auctionId}`);

    await page.goto(`/auction/${auctionId}`);

    // Wait for the page to load
    await expect(
      page.getByText(`#${auctionId}`).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Unlock wallet to reveal private data (seller identity)
    await expect(async () => {
      const unlockButton = page.getByRole("button", { name: "Unlock wallet" });
      const unlockVisible = await unlockButton.isVisible().catch(() => false);
      if (unlockVisible) {
        await unlockButton.click();
        await page.waitForTimeout(3_000);
      }

      // Wait for loading to complete
      const loadingButton = page.getByRole("button", { name: "Loading balance" });
      const isLoading = await loadingButton.isVisible().catch(() => false);
      if (isLoading) throw new Error("STILL_LOADING");

      // The "Place Bid" button should appear but be disabled
      const placeBidButton = page.getByRole("button", { name: "Place Bid" });
      await expect(placeBidButton).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000, intervals: [5_000] });

    // Verify the Place Bid button is disabled (own auction)
    const placeBidButton = page.getByRole("button", { name: "Place Bid" });
    await expect(placeBidButton).toBeDisabled({ timeout: 5_000 });
    console.log("[self-bid] Place Bid button is disabled");

    // Hover over the disabled button to trigger the tooltip
    // The button is wrapped in a TooltipTrigger span
    const tooltipTrigger = placeBidButton.locator("..");
    await tooltipTrigger.hover();

    // Verify the tooltip text appears
    const tooltip = page.getByText("You cannot bid on your own auction");
    await expect(tooltip).toBeVisible({ timeout: 5_000 });
    console.log("[self-bid] Tooltip 'You cannot bid on your own auction' visible");
  });
});
