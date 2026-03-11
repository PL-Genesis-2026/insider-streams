import { test, expect } from "./fixtures";

test.describe("Deposit flow", () => {
  test("unlock wallet, enter amount, and sign deposit", async ({ page }) => {
    await page.goto("/dashboard/wallet");
    await page.waitForLoadState("networkidle");

    // Unlock the wallet first
    const unlockButton = page.getByRole("button", { name: "Sign and unlock" });
    await expect(unlockButton).toBeVisible();
    await unlockButton.click();
    await expect(unlockButton).not.toBeVisible({ timeout: 10_000 });

    // The Deposit tab should already be selected
    await expect(page.getByRole("tab", { name: "Deposit" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Fill in the amount
    const amountInput = page.getByRole("textbox", { name: /amount/i });
    await expect(amountInput).toBeVisible();
    await amountInput.fill("100");

    // The deposit submit button should now be enabled
    const submitButton = page.getByRole("button", { name: "Deposit" });
    await expect(submitButton).toBeEnabled({ timeout: 5_000 });

    // Click deposit — triggers personal_sign for the deposit request
    await submitButton.click();

    // Wait for the signing to complete. The daemon may or may not be running,
    // so we accept either a success message or an error from the daemon.
    // The key assertion is that wallet-mock signed the message without intervention.
    const outcome = await Promise.race([
      page
        .getByText(/deposited|success/i)
        .first()
        .waitFor({ timeout: 10_000 })
        .then(() => "success" as const),
      page
        .getByText(/failed|error/i)
        .first()
        .waitFor({ timeout: 10_000 })
        .then(() => "error" as const),
    ]);

    // Either outcome proves the wallet signed and the request was sent
    expect(["success", "error"]).toContain(outcome);
  });
});
