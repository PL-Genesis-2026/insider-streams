/**
 * Seller dashboard E2E tests.
 *
 * Verifies that a seller can:
 * 1. See their auctions on /dashboard/signals
 * 2. Reveal their own secret on an auction page
 *
 * Uses the createAuction test account (keen-puma-9) which created auctions
 * in global-setup and has secret data in the daemon SQLite.
 */
import { test, expect, TEST_ACCOUNTS } from "./fixtures";
import { readTestState, findOpenAuctions, signedDaemonRequest } from "./helpers";
import { privateKeyToAccount } from "viem/accounts";

// Use the same account that created the auctions in global-setup
test.use({ walletPrivateKey: TEST_ACCOUNTS.createAuction });

test.describe("Seller dashboard", () => {
  test("signals tab shows seller auctions after unlock", async ({ page }) => {
    await page.goto("/dashboard/signals");
    await page.waitForLoadState("networkidle");

    // The signals tab shows "Unlock your wallet to view your signals" when not revealed
    const unlockButton = page.getByRole("button", { name: /unlock wallet/i });
    await expect(unlockButton).toBeVisible({ timeout: 15_000 });
    console.log("[seller-dash] Clicking 'Unlock wallet'...");
    await unlockButton.click();

    // Wait for seller profile to load — should show stats grid
    // The SellerTab shows "Reputation" as a stat card label
    const reputationLabel = page.getByText("Reputation").first();
    await expect(reputationLabel).toBeVisible({ timeout: 30_000 });
    console.log("[seller-dash] Reputation stat visible");

    // Verify "Total auctions" stat appears
    const totalAuctionsLabel = page.getByText("Total auctions").first();
    await expect(totalAuctionsLabel).toBeVisible({ timeout: 5_000 });
    console.log("[seller-dash] Total auctions stat visible");

    // Verify "Your auctions" section header appears
    const yourAuctions = page.getByText("Your auctions").first();
    await expect(yourAuctions).toBeVisible({ timeout: 5_000 });
    console.log("[seller-dash] 'Your auctions' section visible");

    // Verify at least one auction card is rendered (links to /auction/[id])
    const auctionLink = page.locator('a[href^="/auction/"]').first();
    await expect(auctionLink).toBeVisible({ timeout: 15_000 });
    console.log("[seller-dash] Auction card visible");

    // Verify "No signals yet" is NOT shown (seller has auctions)
    const noSignals = page.getByText("No signals yet");
    await expect(noSignals).not.toBeVisible();
    console.log("[seller-dash] 'No signals yet' correctly absent");
  });

  test("seller can reveal own secret on auction page", async ({ page }) => {
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

    console.log(`[seller-secret] Using auction #${auctionId}`);

    // Log network requests to debug secret fetching
    page.on("request", (req) => {
      if (req.url().includes("private-data/secrets")) {
        console.log(`[seller-secret] >> POST ${req.url()} body=${req.postData()?.substring(0, 200)}`);
      }
    });
    page.on("response", async (res) => {
      if (res.url().includes("private-data/secrets")) {
        const body = await res.text().catch(() => "?");
        console.log(`[seller-secret] << ${res.status()} ${res.url()} body=${body.substring(0, 300)}`);
      }
    });

    await page.goto(`/auction/${auctionId}`);

    // Wait for the auction page to load
    await expect(
      page.getByText(`#${auctionId}`).first(),
    ).toBeVisible({ timeout: 15_000 });

    // The secret section shows "Reveal secret" button for connected wallets.
    // The wallet client may not be ready immediately after page load, so retry
    // clicking "Reveal secret" until the secret data appears.
    const revealButton = page.getByRole("button", { name: "Reveal secret", exact: true });
    const hideButton = page.getByRole("button", { name: /hide secret/i });

    await expect(async () => {
      const revealVisible = await revealButton.isVisible().catch(() => false);
      if (revealVisible) {
        console.log("[seller-secret] Clicking 'Reveal secret'...");
        await revealButton.click();
        await page.waitForTimeout(3_000);
      }

      // Assert "Hide secret" button is visible (proves secret was revealed)
      await expect(hideButton).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000, intervals: [5_000] });

    console.log("[seller-secret] 'Hide secret' button visible — secret fully revealed");

    // Verify the "not available" message is NOT shown
    const notAvailable = page.getByText("Secret not available");
    await expect(notAvailable).not.toBeVisible();
    console.log("[seller-secret] 'Secret not available' correctly absent");

    // Verify "Secret data" label is visible (part of RevealedContent)
    const secretDataLabel = page.getByText("Secret data").first();
    await expect(secretDataLabel).toBeVisible({ timeout: 5_000 });
    console.log("[seller-secret] 'Secret data' label visible");
  });
});
