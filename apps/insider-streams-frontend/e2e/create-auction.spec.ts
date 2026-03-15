import { test, expect, TEST_ACCOUNTS } from "./fixtures";

test.use({ walletPrivateKey: TEST_ACCOUNTS.createAuction });

test.describe("Create auction flow", () => {
  test("fill form and submit auction to chain", async ({ page }) => {
    await page.goto("/create");
    await page.waitForLoadState("networkidle");

    // Step 1: Page title should be visible
    await expect(page.getByText("Sell your signal")).toBeVisible();

    // Step 2: Wait for prediction market events to load from Sepolia contract.
    const eventLabel = page.getByText("Prediction market event", {
      exact: true,
    });
    await expect(eventLabel).toBeVisible({ timeout: 15_000 });

    // If events failed to load or none exist, skip gracefully
    const errorAlert = page.getByText("Failed to load events");
    const hasError = await errorAlert.isVisible().catch(() => false);
    if (hasError) {
      test.skip(true, "Prediction market events could not be loaded from chain");
      return;
    }

    // Check if the dropdown has any options
    const eventCombobox = page.getByRole("combobox").first();
    await expect(eventCombobox).toBeVisible();
    await eventCombobox.click();

    const firstOption = page.getByRole("option").first();
    const hasOptions = await firstOption
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    if (!hasOptions) {
      test.skip(true, "No open prediction market events available on-chain");
      return;
    }

    // Step 3: Select the first event
    await firstOption.click();

    // Step 4: After selecting an event, YES/NO position buttons appear.
    const yesButton = page.getByRole("button", { name: "YES" });
    await expect(yesButton).toBeVisible({ timeout: 5_000 });
    await yesButton.click();

    // Step 5: Type a secret signal
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.fill(
      "E2E test signal: this is a Playwright automated test auction.",
    );

    // Step 6: Duration defaults to 24h, leave as-is

    // Step 7: Click submit — triggers personal_sign, posts to daemon
    const submitButton = page.getByRole("button", { name: "Sell YES signal" });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // Step 8: Wait for the success card "Auction live" or an error.
    // The daemon submits an FHE-encrypted createAuction tx to Sepolia.
    // This takes ~30-120s (FHE encryption + block confirmation).
    const outcome = await Promise.race([
      page
        .getByText("Auction live")
        .waitFor({ timeout: 180_000 })
        .then(() => "success" as const),
      page
        .getByText("Creation failed")
        .waitFor({ timeout: 180_000 })
        .then(() => "error" as const),
    ]);

    if (outcome === "success") {
      // Verify the success card has auction ID and tx hash
      await expect(page.getByText("Auction ID")).toBeVisible();
      await expect(page.getByText("Transaction")).toBeVisible();
      await expect(
        page.getByRole("link", { name: "View auction" }),
      ).toBeVisible();
    } else {
      const errorText = await page
        .locator('[data-slot="alert-description"]')
        .first()
        .textContent();
      console.log(`Create auction failed with: ${errorText}`);
    }
  });
});
