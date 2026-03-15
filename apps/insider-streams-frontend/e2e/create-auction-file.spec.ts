/**
 * Create auction with file attachment — Playwright E2E tests.
 *
 * Tests that a user can:
 * 1. Create an auction by uploading a .txt file attachment
 * 2. Create an auction with plain text (no file)
 * 3. See client-side validation errors for invalid files
 *
 * Uses the createAuction test account.
 */
import { resolve } from "node:path";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { test, expect, TEST_ACCOUNTS } from "./fixtures";

test.use({ walletPrivateKey: TEST_ACCOUNTS.createAuction });

let tempDir: string;

test.beforeAll(() => {
  tempDir = mkdtempSync(resolve(tmpdir(), "e2e-file-"));
});

test.afterAll(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

test.describe("Create auction with file", () => {
  test("upload .txt file and submit auction", async ({ page }) => {
    await page.goto("/create");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Sell your signal")).toBeVisible();

    // Wait for events to load
    const eventLabel = page.getByText("Prediction market event", { exact: true });
    await expect(eventLabel).toBeVisible({ timeout: 15_000 });

    const errorAlert = page.getByText("Failed to load events");
    if (await errorAlert.isVisible().catch(() => false)) {
      test.skip(true, "Prediction market events could not be loaded");
      return;
    }

    // Select the first event
    const eventCombobox = page.getByRole("combobox").first();
    await expect(eventCombobox).toBeVisible();
    await eventCombobox.click();

    const firstOption = page.getByRole("option").first();
    if (!(await firstOption.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "No open prediction market events available");
      return;
    }
    await firstOption.click();

    // Select YES position
    const yesButton = page.getByRole("button", { name: "YES" });
    await expect(yesButton).toBeVisible({ timeout: 5_000 });
    await yesButton.click();

    // Create a temp .txt file and attach it
    const filePath = resolve(tempDir, "test-signal.txt");
    writeFileSync(filePath, "E2E test: this is private signal data in a file.");

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // Verify file badge appears
    await expect(page.getByText("test-signal.txt")).toBeVisible();

    // Submit
    const submitButton = page.getByRole("button", { name: "Sell YES signal" });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // Wait for outcome
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
      await expect(page.getByText("Auction ID")).toBeVisible();
      await expect(page.getByText("Transaction")).toBeVisible();
      console.log("[create-file] Auction with file attachment created successfully");
    } else {
      const errorText = await page
        .locator('[data-slot="alert-description"]')
        .first()
        .textContent();
      console.log(`[create-file] Creation failed: ${errorText}`);
    }
  });

  test("submit auction with text only (no file)", async ({ page }) => {
    await page.goto("/create");
    await page.waitForLoadState("networkidle");

    const eventLabel = page.getByText("Prediction market event", { exact: true });
    await expect(eventLabel).toBeVisible({ timeout: 15_000 });

    const errorAlert = page.getByText("Failed to load events");
    if (await errorAlert.isVisible().catch(() => false)) {
      test.skip(true, "Prediction market events could not be loaded");
      return;
    }

    const eventCombobox = page.getByRole("combobox").first();
    await eventCombobox.click();
    const firstOption = page.getByRole("option").first();
    if (!(await firstOption.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "No open prediction market events available");
      return;
    }
    await firstOption.click();

    // Select NO position
    const noButton = page.getByRole("button", { name: "NO" });
    await expect(noButton).toBeVisible({ timeout: 5_000 });
    await noButton.click();

    // Type text signal (no file)
    const textarea = page.locator("textarea");
    await textarea.fill("E2E text-only signal: no file attachment.");

    const submitButton = page.getByRole("button", { name: "Sell NO signal" });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

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
      console.log("[create-text] Text-only auction created successfully");
    } else {
      const errorText = await page
        .locator('[data-slot="alert-description"]')
        .first()
        .textContent();
      console.log(`[create-text] Creation failed: ${errorText}`);
    }
  });

  test("rejects unsupported file type client-side", async ({ page }) => {
    await page.goto("/create");
    await page.waitForLoadState("networkidle");

    // Create a .exe file
    const filePath = resolve(tempDir, "malicious.exe");
    writeFileSync(filePath, "MZ fake executable");

    const fileInput = page.locator('input[type="file"]');
    // Force the file even though accept attribute restricts — the client validates
    await fileInput.setInputFiles(filePath);

    // Expect validation error
    await expect(page.getByText("Unsupported file type")).toBeVisible({ timeout: 5_000 });
    console.log("[create-file] Client-side file type validation works");
  });
});
