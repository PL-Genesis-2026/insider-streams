/**
 * Dashboard positions E2E test.
 *
 * Navigates to /dashboard/positions, unlocks wallet, and verifies
 * that auction positions are displayed with titles, bid amounts,
 * and status indicators.
 *
 * Uses bidder1 account which has bid history from previous test runs.
 */
import { test, expect, TEST_ACCOUNTS } from "./fixtures";

test.use({ walletPrivateKey: TEST_ACCOUNTS.bidder1 });

test.describe("Dashboard positions", () => {
  test("shows auction positions with bid data after unlock", async ({ page }) => {
    await page.goto("/dashboard/positions");
    await page.waitForLoadState("networkidle");

    // Unlock wallet — the positions tab shows "Unlock wallet" to trigger signature
    const unlockButton = page.getByRole("button", { name: /unlock wallet/i });
    await expect(unlockButton).toBeVisible({ timeout: 15_000 });
    console.log("[positions] Clicking 'Unlock wallet'...");
    await unlockButton.click();

    // Wait for positions tab to load with auction data
    // The summary shows "Tracked auctions" — wait for it to appear
    const trackedLabel = page.getByText("Tracked auctions");
    await expect(trackedLabel).toBeVisible({ timeout: 30_000 });
    console.log("[positions] Tracked auctions label visible");

    // Verify at least one auction card appears with a title
    // Auction cards contain links to /auction/[id]
    const auctionLink = page.locator('a[href^="/auction/"]').first();
    await expect(auctionLink).toBeVisible({ timeout: 15_000 });
    console.log("[positions] Auction card visible");

    // Verify "Latest bid" label appears (our renamed field)
    const latestBidLabel = page.getByText("Latest bid").first();
    await expect(latestBidLabel).toBeVisible({ timeout: 5_000 });
    console.log("[positions] 'Latest bid' label visible");

    // Verify "Status" label appears (replaced "Auto-bet amount")
    const statusLabel = page.getByText("Status", { exact: true }).first();
    await expect(statusLabel).toBeVisible({ timeout: 5_000 });
    console.log("[positions] 'Status' label visible");

    // Verify a status value is shown (Winning, Won, Losing, or Refunded)
    const statusValue = page.getByText(/^(Winning|Won|Losing|Refunded|—)$/).first();
    await expect(statusValue).toBeVisible({ timeout: 5_000 });
    const statusText = await statusValue.textContent();
    console.log(`[positions] Status value: "${statusText}"`);

    // Verify "Auto-bet amount" is NOT shown
    const autoBet = page.getByText("Auto-bet amount");
    await expect(autoBet).not.toBeVisible();
    console.log("[positions] 'Auto-bet amount' correctly absent");
  });
});
