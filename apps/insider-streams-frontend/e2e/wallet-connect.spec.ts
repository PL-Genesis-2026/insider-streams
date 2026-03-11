import { test, expect, testAccount } from "./fixtures";

test.describe("Wallet connection", () => {
  test("auto-connects via EIP-6963 and shows address", async ({ page }) => {
    await page.goto("/dashboard/wallet");
    await page.waitForLoadState("networkidle");

    // Mock wallet should auto-connect — address visible in the header
    const shortAddress = `${testAccount.address.slice(0, 6)}...${testAccount.address.slice(-4)}`;
    await expect(page.getByText(shortAddress)).toBeVisible();
  });

  test("unlock wallet via personal_sign", async ({ page }) => {
    await page.goto("/dashboard/wallet");
    await page.waitForLoadState("networkidle");

    // Should see the unlock prompt
    const unlockButton = page.getByRole("button", { name: "Sign and unlock" });
    await expect(unlockButton).toBeVisible();

    // Click unlock — triggers personal_sign which wallet-mock handles
    await unlockButton.click();

    // After signing, unlock button should disappear
    await expect(unlockButton).not.toBeVisible({ timeout: 10_000 });

    // Deposit/Withdraw are tabs (not buttons) in the wallet action center
    await expect(page.getByRole("tab", { name: "Deposit" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Withdraw" })).toBeVisible();
  });
});
