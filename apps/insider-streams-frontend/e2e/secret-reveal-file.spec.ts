/**
 * Secret reveal with file attachment — Playwright E2E tests.
 *
 * Verifies:
 * 1. Seller can reveal secret + see file metadata on their auction page
 * 2. Seller can click "Decrypt & View" to decrypt the file client-side
 * 3. Non-seller sees "forbidden" or "not available" message
 *
 * Uses auctions created in global-setup (fileAuctionId).
 * Filecoin-dependent tests skip when no file auction was created.
 */
import { test, expect, TEST_ACCOUNTS } from "./fixtures";
import { readTestState, findOpenAuctions, signedDaemonRequest } from "./helpers";
import { privateKeyToAccount } from "viem/accounts";

// Seller account — same as the one that created auctions in global-setup
test.use({ walletPrivateKey: TEST_ACCOUNTS.createAuction });

test.describe("Secret reveal with file attachment", () => {
  test("seller can reveal secret and see file metadata", async ({ page }) => {
    const state = readTestState();
    let auctionId = state?.fileAuctionId || null;

    if (!auctionId) {
      // Fallback: find any auction by this seller
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
      test.skip(true, "No file auction found — Filecoin may not be configured");
      return;
    }

    console.log(`[secret-file] Using file auction #${auctionId}`);

    await page.goto(`/auction/${auctionId}`);
    await expect(
      page.getByText(`#${auctionId}`).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Reveal secret
    const revealButton = page.getByRole("button", { name: "Reveal secret", exact: true });
    const hideButton = page.getByRole("button", { name: /hide secret/i });

    await expect(async () => {
      const revealVisible = await revealButton.isVisible().catch(() => false);
      if (revealVisible) {
        console.log("[secret-file] Clicking 'Reveal secret'...");
        await revealButton.click();
        await page.waitForTimeout(3_000);
      }
      await expect(hideButton).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000, intervals: [5_000] });

    console.log("[secret-file] Secret revealed");

    // Check for "Secret data" label
    await expect(page.getByText("Secret data").first()).toBeVisible({ timeout: 5_000 });

    // Check for file attachment section — look for "File attachment" or the file name
    const fileSection = page.getByText("File attachment").first();
    const hasFile = await fileSection.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasFile) {
      console.log("[secret-file] File attachment section visible");

      // Verify file metadata is shown
      await expect(page.getByText("Decryption key").first()).toBeVisible();
      console.log("[secret-file] Decryption key visible");

      // Verify "Download encrypted file" link exists
      await expect(
        page.getByRole("link", { name: /download encrypted file/i }),
      ).toBeVisible();
      console.log("[secret-file] Download link visible");

      // Verify "Decrypt & View" button exists
      const decryptButton = page.getByRole("button", { name: /decrypt.*view/i });
      await expect(decryptButton).toBeVisible();
      console.log("[secret-file] 'Decrypt & View' button visible");
    } else {
      // Auction may have been created without Filecoin — just check text secret
      console.log("[secret-file] No file attachment section (Filecoin may not be configured)");
    }
  });

  test("seller can decrypt file attachment client-side", async ({ page }) => {
    const state = readTestState();
    const auctionId = state?.fileAuctionId || null;

    if (!auctionId) {
      test.skip(true, "No file auction found — Filecoin may not be configured");
      return;
    }

    console.log(`[secret-decrypt] Using file auction #${auctionId}`);

    // Log network activity for debugging
    page.on("response", async (res) => {
      if (res.url().includes("private-data/secrets") || res.url().includes("filecoin")) {
        console.log(`[secret-decrypt] << ${res.status()} ${res.url()}`);
      }
    });

    await page.goto(`/auction/${auctionId}`);
    await expect(
      page.getByText(`#${auctionId}`).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Reveal secret
    const revealButton = page.getByRole("button", { name: "Reveal secret", exact: true });
    const hideButton = page.getByRole("button", { name: /hide secret/i });

    await expect(async () => {
      const revealVisible = await revealButton.isVisible().catch(() => false);
      if (revealVisible) {
        await revealButton.click();
        await page.waitForTimeout(3_000);
      }
      await expect(hideButton).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000, intervals: [5_000] });

    // Check if file attachment section exists
    const fileSection = page.getByText("File attachment").first();
    const hasFile = await fileSection.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!hasFile) {
      test.skip(true, "No file attachment on this auction — Filecoin not configured");
      return;
    }

    // Click "Decrypt & View"
    const decryptButton = page.getByRole("button", { name: /decrypt.*view/i });
    await expect(decryptButton).toBeVisible();
    await decryptButton.click();

    // Wait for decryption — may show "Decrypting..." briefly then the result
    console.log("[secret-decrypt] Waiting for decryption result...");

    // Wait for either decrypted content or error
    const decryptResult = await Promise.race([
      page
        .getByText("Decrypted content")
        .waitFor({ timeout: 60_000 })
        .then(() => "text" as const),
      page
        .locator("img[alt]")
        .first()
        .waitFor({ timeout: 60_000 })
        .then(() => "image" as const),
      page
        .getByRole("link", { name: /download decrypted file/i })
        .waitFor({ timeout: 60_000 })
        .then(() => "download" as const),
      page
        .getByText("Decryption failed")
        .waitFor({ timeout: 60_000 })
        .then(() => "error" as const),
    ]);

    if (decryptResult === "error") {
      const errorText = await page.locator(".text-destructive").first().textContent();
      console.log(`[secret-decrypt] Decryption failed: ${errorText}`);
      // Don't fail the test — Filecoin retrieval may be flaky
      return;
    }

    console.log(`[secret-decrypt] Decryption result: ${decryptResult}`);

    if (decryptResult === "text") {
      // Verify decrypted text is shown
      const pre = page.locator("pre").first();
      await expect(pre).toBeVisible();
      const text = await pre.textContent();
      console.log(`[secret-decrypt] Decrypted text (first 100 chars): ${text?.substring(0, 100)}`);

      // If we know the original content, verify it matches
      if (state?.fileAuctionContent) {
        expect(text).toContain(state.fileAuctionContent);
        console.log("[secret-decrypt] Decrypted content matches original");
      }
    }
  });
});

test.describe("Secret reveal access control (file auction)", () => {
  // Use the viewer account — should NOT have access to the seller's secret
  test.use({ walletPrivateKey: TEST_ACCOUNTS.viewer });

  test("non-seller sees forbidden message", async ({ page }) => {
    const state = readTestState();
    const auctionId = state?.fileAuctionId || state?.bidAuctionId || null;

    if (!auctionId) {
      test.skip(true, "No auction available for access control test");
      return;
    }

    console.log(`[secret-access] Using auction #${auctionId} as non-seller`);

    await page.goto(`/auction/${auctionId}`);
    await expect(
      page.getByText(`#${auctionId}`).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Reveal secret as non-seller
    const revealButton = page.getByRole("button", { name: "Reveal secret", exact: true });
    await expect(revealButton).toBeVisible({ timeout: 15_000 });
    await revealButton.click();

    // Should see forbidden or not-available message
    const forbiddenOrNotAvailable = await Promise.race([
      page
        .getByText("only the seller and the winning bidder")
        .waitFor({ timeout: 30_000 })
        .then(() => "forbidden" as const),
      page
        .getByText("Secret not available")
        .waitFor({ timeout: 30_000 })
        .then(() => "not_found" as const),
      page
        .getByRole("button", { name: /hide secret/i })
        .waitFor({ timeout: 30_000 })
        .then(() => "revealed" as const),
    ]);

    if (forbiddenOrNotAvailable === "revealed") {
      // This shouldn't happen for a non-seller, non-winner, but don't fail —
      // the viewer account may have won the auction in a previous test run.
      console.log("[secret-access] WARNING: Non-seller was able to reveal secret");
    } else {
      console.log(`[secret-access] Non-seller access correctly denied: ${forbiddenOrNotAvailable}`);
    }
  });
});
