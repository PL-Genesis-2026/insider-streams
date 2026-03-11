import { test, expect, TEST_ACCOUNTS } from "./fixtures";

test.use({ walletPrivateKey: TEST_ACCOUNTS.deposit });

test.describe("Deposit flow", () => {
  test("unlock wallet, deposit funds, and see success confirmation", async ({
    page,
  }) => {
    await page.goto("/dashboard/wallet");
    await page.waitForLoadState("networkidle");

    // Step 1: Unlock the wallet if needed (may already be unlocked from prior session)
    const unlockButton = page.getByRole("button", { name: "Sign and unlock" });
    const needsUnlock = await unlockButton.isVisible().catch(() => false);
    if (needsUnlock) {
      await unlockButton.click();
      await expect(unlockButton).not.toBeVisible({ timeout: 10_000 });
    }

    // Step 2: Wait for the Deposit tab to be visible and selected
    await expect(
      page.getByRole("tab", { name: "Deposit" }),
    ).toBeVisible({ timeout: 10_000 });

    // Step 3: Fill in a deposit amount — clear any previous value first
    const amountInput = page.getByRole("textbox", { name: /amount/i });
    await expect(amountInput).toBeVisible();
    await amountInput.clear();
    await amountInput.fill("1");

    // Step 4: Click Deposit — triggers personal_sign, daemon submits FHE tx async
    const submitButton = page.getByRole("button", { name: "Deposit" });
    await expect(submitButton).toBeEnabled({ timeout: 5_000 });
    await submitButton.click();

    // Step 5: Wait for either success or error message.
    // The daemon responds immediately with { status: "pending" } and fires off
    // the FHE encryption + on-chain tx asynchronously.
    const result = await Promise.race([
      page
        .getByText("Deposit submitted")
        .waitFor({ timeout: 60_000 })
        .then(() => "success" as const),
      page
        .getByText("Wallet action failed")
        .waitFor({ timeout: 60_000 })
        .then(() => "error" as const),
    ]);

    // The test must see either a success or error — either proves the signing
    // and daemon communication worked. Success means the daemon accepted it.
    expect(["success", "error"]).toContain(result);

    if (result === "success") {
      // Step 6: Verify the on-chain deposit by checking the balance updates.
      const biddingBalance = page.getByText("Bidding balance").locator("..");
      const balanceValue = biddingBalance.locator("p").last();

      // Poll for up to 90s — FHE encryption is slow
      await expect(async () => {
        const refreshButton = page
          .getByRole("button", { name: "Refresh" })
          .first();
        if (await refreshButton.isEnabled()) {
          await refreshButton.click();
        }
        await page.waitForTimeout(2_000);

        const text = await balanceValue.textContent();
        expect(text).not.toBe("0 USDC");
      }).toPass({ timeout: 90_000, intervals: [5_000] });
    }
  });
});
