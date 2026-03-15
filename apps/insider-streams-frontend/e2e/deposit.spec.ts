/**
 * Deposit flow E2E test.
 *
 * Tests the full deposit pipeline:
 * 1. Unlock wallet (personal_sign)
 * 2. Wait for FHE SDK to load in browser (button shows "Loading FHE...")
 * 3. Use daemon faucet to get cUSDC
 * 4. Submit deposit (FHE encrypt -> confidentialTransfer -> daemon deposit)
 * 5. Verify balance increases on-chain via daemon /balance API
 *
 * Uses TEST_ACCOUNT_2 (deposit account).
 *
 * See e2e/docs/deposit-workflow.md for full architecture reference.
 */
import { test, expect, TEST_ACCOUNTS } from "./fixtures";
import { signedDaemonRequest } from "./helpers";
import { privateKeyToAccount } from "viem/accounts";

test.use({ walletPrivateKey: TEST_ACCOUNTS.deposit });

test.describe("Deposit flow", () => {
  test("unlock wallet and verify deposit tab loads", async ({ page }) => {
    console.log("[deposit] Navigating to /dashboard/wallet");
    await page.goto("/dashboard/wallet");
    await page.waitForLoadState("networkidle");

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Unlock the wallet if needed
    const unlockButton = page.getByRole("button", { name: "Sign and unlock" });
    if (await unlockButton.isVisible().catch(() => false)) {
      console.log("[deposit] Clicking 'Sign and unlock'...");
      await unlockButton.click();
    }

    // Wait for the Deposit tab
    await expect(
      page.getByRole("tab", { name: "Deposit" }),
    ).toBeVisible({ timeout: 60_000 });
    console.log("[deposit] Deposit tab visible");

    // Verify deposit form elements
    await expect(page.locator("#wallet-fund-amount")).toBeVisible();
    // There may be multiple buttons matching "deposit" or "loading fhe"
    // (e.g. Deposit tab + Deposit button). Check the form-level button.
    await expect(
      page.getByRole("button", { name: /deposit|loading fhe/i }).first(),
    ).toBeVisible();
    console.log("[deposit] Deposit form visible");

    if (consoleErrors.length > 0) {
      console.log("[deposit] Console errors:", consoleErrors.slice(0, 5));
    }
  });

  test("faucet, deposit, and verify balance increase", async ({ page }) => {
    test.setTimeout(300_000); // 5 min — FHE operations + retries

    const depositAccount = privateKeyToAccount(TEST_ACCOUNTS.deposit);
    console.log(`[deposit] Account: ${depositAccount.address}`);

    // Track console and network for debugging
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (
        text.includes("fhevm") || text.includes("FHE") ||
        text.includes("SDK") || text.includes("deposit") ||
        text.includes("encrypt") || msg.type() === "error"
      ) {
        consoleLogs.push(`[${msg.type()}] ${text.slice(0, 200)}`);
      }
    });

    const apiLog: { url: string; status?: number; body?: string }[] = [];
    const daemonHost = (process.env.DAEMON_URL || "http://localhost:3001").replace(/^https?:\/\//, "");
    page.on("response", async (res) => {
      const url = res.url();
      if (url.includes("/api/") || url.includes(daemonHost)) {
        const entry: (typeof apiLog)[0] = { url, status: res.status() };
        try { entry.body = (await res.text()).slice(0, 200); } catch { /* */ }
        apiLog.push(entry);
      }
    });

    // ── Step 0: Check pre-deposit balance via daemon ──
    let preBalance = 0n;
    try {
      const { data } = await signedDaemonRequest("/balance", depositAccount, {}, 60_000);
      preBalance = BigInt((data as Record<string, string>).balance ?? "0");
      console.log(`[deposit] Pre-deposit daemon balance: ${Number(preBalance) / 1e6} USDC`);
    } catch (err: unknown) {
      console.log(`[deposit] Pre-deposit balance check: ${err instanceof Error ? err.message : err}`);
    }

    // ── Step 1: Navigate and unlock FIRST (before faucet) ──
    // Navigate early so the FHE SDK starts initializing. The SDK init makes
    // RPC calls that can 429 if we flood the RPC with faucet txs first.
    await page.goto("/dashboard/wallet");
    await page.waitForLoadState("networkidle");

    const unlockButton = page.getByRole("button", { name: "Sign and unlock" });
    if (await unlockButton.isVisible().catch(() => false)) {
      console.log("[deposit] Unlocking wallet...");
      await unlockButton.click();
    }

    // Wait for deposit tab to confirm page loaded
    const depositTab = page.getByRole("tab", { name: "Deposit" });
    await expect(depositTab).toBeVisible({ timeout: 60_000 });
    console.log("[deposit] Deposit tab visible");

    // ── Step 2: Wait for FHE SDK to load ──
    const depositButton = page.getByRole("button", { name: "Deposit" });
    const loadingFheButton = page.getByRole("button", { name: /loading fhe/i });
    const initEncryptionMsg = page.getByText(/initializing encryption/i);

    console.log("[deposit] Waiting for FHE SDK to initialize...");
    const fheLoadStart = Date.now();
    // Verify the inline "Initializing encryption..." message appears while loading
    let sawInitMessage = false;
    await expect(async () => {
      const isLoading = await loadingFheButton.isVisible().catch(() => false);
      const isReady = await depositButton.isVisible().catch(() => false);
      if (!sawInitMessage && isLoading) {
        sawInitMessage = await initEncryptionMsg.isVisible().catch(() => false);
      }
      const elapsed = ((Date.now() - fheLoadStart) / 1000).toFixed(0);
      console.log(`[deposit] FHE SDK: loading=${isLoading} ready=${isReady} initMsg=${sawInitMessage} (${elapsed}s)`);
      if (isLoading) throw new Error("SDK_LOADING");
      expect(isReady).toBe(true);
    }).toPass({ timeout: 60_000, intervals: [3_000] });
    console.log(`[deposit] "Initializing encryption..." message was ${sawInitMessage ? "seen" : "not seen (SDK loaded too fast)"}`);

    const fheLoadTime = ((Date.now() - fheLoadStart) / 1000).toFixed(1);
    console.log(`[deposit] FHE SDK ready in ${fheLoadTime}s`);

    // ── Step 3: Get cUSDC via daemon faucet (AFTER SDK init) ──
    // Each faucet call mints 25 cUSDC. Request 4x = 100 cUSDC.
    // Run after SDK init to avoid RPC rate limit conflicts.
    const faucetCalls = 4;
    for (let i = 0; i < faucetCalls; i++) {
      console.log(`[deposit] Faucet request ${i + 1}/${faucetCalls}...`);
      try {
        const { status, data } = await signedDaemonRequest("/faucet", depositAccount, {}, 60_000);
        console.log(`[deposit] Faucet ${i + 1}: ${status} txHash=${(data as Record<string, unknown>).txHash ?? "?"}`);
      } catch (err: unknown) {
        console.log(`[deposit] Faucet ${i + 1}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // ── Step 4: Fill deposit amount ──
    const amountInput = page.locator("#wallet-fund-amount");
    await expect(amountInput).toBeVisible({ timeout: 5_000 });

    // Deposit 100 USDC — large enough for subsequent bid tests
    const depositAmount = "100";
    await amountInput.clear();
    await amountInput.pressSequentially(depositAmount, { delay: 50 });

    const inputValue = await amountInput.inputValue();
    console.log(`[deposit] Input value after typing: "${inputValue}"`);

    // Wait for the button to be enabled.
    // disabled={!parsedAmount || isDepositing || fheSdkStatus !== "ready"}
    console.log("[deposit] Waiting for Deposit button to be enabled...");
    await expect(depositButton).toBeEnabled({ timeout: 30_000 });

    // ── Step 5: Click deposit with retry ──
    // The useFhevm() hook in useDeposit() and in wallet-action-center are
    // separate hook instances. There can be a brief race where the button is
    // enabled but useDeposit's fhevmInstance hasn't picked up cachedInstance yet.
    // If we get "FHE SDK not ready", wait and retry.
    let outcome: "success" | "alert-error" | "timeout" = "timeout";
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`[deposit] Deposit attempt ${attempt}/3...`);

      await expect(depositButton).toBeEnabled({ timeout: 10_000 });
      await depositButton.click();
      console.log("[deposit] Clicked Deposit");

      // Monitor for "Depositing..." state (FHE encrypt in progress)
      const depositingButton = page.getByRole("button", { name: /depositing/i });
      const sawDepositing = await depositingButton
        .isVisible({ timeout: 10_000 })
        .catch(() => false);
      if (sawDepositing) {
        console.log('[deposit] "Depositing..." state seen — FHE encrypt in progress');
      }

      // Wait for result
      outcome = await Promise.race([
        page.getByText(/deposit complete/i)
          .waitFor({ timeout: 150_000 })
          .then(() => "success" as const),
        page.locator('[role="alert"]').filter({ hasText: /fail|error/i })
          .waitFor({ timeout: 150_000 })
          .then(() => "alert-error" as const),
      ]).catch(() => "timeout" as const);

      console.log(`[deposit] Attempt ${attempt} outcome: ${outcome}`);

      if (outcome === "success") break;

      if (outcome === "alert-error") {
        const alertText = await page
          .locator('[role="alert"]')
          .first()
          .textContent()
          .catch(() => "");
        console.log(`[deposit] Alert: "${alertText}"`);

        if (alertText?.includes("FHE SDK not ready") && attempt < 3) {
          console.log("[deposit] FHE SDK not ready — waiting 10s and retrying...");
          // Clear error by re-entering the amount
          await amountInput.clear();
          await page.waitForTimeout(10_000);
          await amountInput.pressSequentially(depositAmount, { delay: 50 });
          continue;
        }
        break;
      }

      break; // timeout — don't retry
    }

    // ── Step 6: Log diagnostics ──
    const errorElements = await page.locator(".text-destructive").allTextContents();
    if (errorElements.length > 0) {
      console.log("[deposit] Error text:", errorElements);
    }

    const depositCalls = apiLog.filter(c =>
      c.url.includes("/deposit") || c.url.includes("/faucet") || c.url.includes("/snapshot"),
    );
    if (depositCalls.length > 0) {
      console.log("[deposit] API calls:", JSON.stringify(
        depositCalls.map(c => ({
          url: c.url.replace(/.*\/api/, "/api"),
          status: c.status,
        })), null, 2,
      ));
    }

    if (consoleLogs.length > 0) {
      console.log("[deposit] FHE console:", consoleLogs.slice(0, 15));
    }

    if (outcome === "timeout") {
      await page.screenshot({ path: "test-results/deposit-timeout.png", fullPage: true });
      console.log("[deposit] Timeout screenshot saved");
    }

    if (outcome === "alert-error") {
      await page.screenshot({ path: "test-results/deposit-error.png", fullPage: true });
      console.log("[deposit] Error screenshot saved");
    }

    // ── Step 7: Verify balance increased via daemon ──
    if (outcome === "success") {
      console.log("[deposit] Verifying balance increase...");
      let postBalance = preBalance;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 5_000));
        try {
          const { data } = await signedDaemonRequest("/balance", depositAccount, {}, 60_000);
          postBalance = BigInt((data as Record<string, string>).balance ?? "0");
          const diff = Number(postBalance - preBalance) / 1e6;
          console.log(`[deposit] Balance poll ${i + 1}: ${Number(postBalance) / 1e6} USDC (+${diff})`);
          if (postBalance > preBalance) break;
        } catch {
          console.log(`[deposit] Balance poll ${i + 1}: failed`);
        }
      }
      console.log(`[deposit] Balance: ${Number(preBalance) / 1e6} -> ${Number(postBalance) / 1e6} USDC`);
    }

    expect(outcome).toBe("success");
  });
});
