import { test, expect, testAccount } from "./fixtures";

test.describe("Wallet connection", () => {
  test("auto-connects via EIP-6963 and shows address", async ({ page }) => {
    await page.goto("/dashboard/wallet");
    await page.waitForLoadState("networkidle");

    const shortAddress = `${testAccount.address.slice(0, 6)}...${testAccount.address.slice(-4)}`;
    await expect(page.getByText(shortAddress)).toBeVisible();
  });

  test("unlock wallet via personal_sign", async ({ page }) => {
    await page.goto("/dashboard/wallet");
    await page.waitForLoadState("networkidle");

    const unlockButton = page.getByRole("button", { name: "Sign and unlock" });
    await expect(unlockButton).toBeVisible();
    await unlockButton.click();

    await expect(unlockButton).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("tab", { name: "Deposit" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Withdraw" })).toBeVisible();
  });
});
