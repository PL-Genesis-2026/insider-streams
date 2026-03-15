/**
 * Relayer error display E2E test.
 *
 * Uses Playwright route interception to mock the /api/funding/snapshot
 * response with a relayer error, then verifies the friendly error
 * message is displayed in the UI.
 *
 * This test does NOT require a running daemon or actual rate limiting.
 */
import { test, expect, TEST_ACCOUNTS } from "./fixtures";

test.use({ walletPrivateKey: TEST_ACCOUNTS.default });

test.describe("Relayer error display", () => {
  test("shows friendly error when balance decryption fails", async ({ page }) => {
    // Intercept the funding snapshot API to return a relayer error
    let intercepted = false;
    await page.route("**/api/funding/snapshot", async (route) => {
      intercepted = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "test-user",
          balance: "0",
          balanceUnavailable: true,
          error: "Relayer rate limit exceeded (429)",
        }),
      });
    });

    await page.goto("/dashboard/wallet");
    await page.waitForLoadState("networkidle");

    // Unlock wallet if needed
    const unlockButton = page.getByRole("button", { name: "Sign and unlock" });
    if (await unlockButton.isVisible().catch(() => false)) {
      await unlockButton.click();
    }

    // Wait for deposit tab to confirm page loaded
    await expect(
      page.getByRole("tab", { name: "Deposit" }),
    ).toBeVisible({ timeout: 60_000 });

    // Verify the intercepted response was used
    expect(intercepted).toBe(true);

    // Verify the friendly error message is displayed
    const errorMsg = page.getByText(/encryption service is busy/i);
    await expect(errorMsg).toBeVisible({ timeout: 15_000 });
    console.log("[relayer-error] Friendly error message visible");
  });
});
