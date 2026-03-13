/**
 * Bid debugging E2E test.
 *
 * Intercepts all network requests to capture exact API responses at each step
 * of the bid flow. Logs everything to help diagnose why bids aren't going through.
 *
 * Can run standalone without global-setup: queries the subgraph for an open auction.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, TEST_ACCOUNTS } from "./fixtures";
import type { TestState } from "./global-setup";

test.use({ walletPrivateKey: TEST_ACCOUNTS.bidder1 });

function getTestState(): TestState | null {
  try {
    return JSON.parse(
      readFileSync(resolve(__dirname, ".test-state.json"), "utf-8"),
    );
  } catch {
    return null;
  }
}

/** Query the subgraph for an open auction (not cancelled/closed). */
async function findOpenAuction(): Promise<string | null> {
  const subgraphUrl =
    process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
    "https://api.studio.thegraph.com/query/1743303/insider-streams-zama/version/latest";

  const now = Math.floor(Date.now() / 1000);
  // Get recent auctions that haven't expired, then exclude cancelled/closed
  const query = `{
    auctionCreateds(
      where: { endTime_gt: "${now}" }
      first: 20
      orderBy: endTime
      orderDirection: asc
    ) {
      auctionId
      sellerId
    }
    auctionCancelleds(first: 1000) {
      auctionId
    }
    auctionCloseds(first: 1000) {
      auctionId
    }
  }`;

  try {
    const res = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json()) as {
      data?: {
        auctionCreateds?: { auctionId: string; sellerId: string }[];
        auctionCancelleds?: { auctionId: string }[];
        auctionCloseds?: { auctionId: string }[];
      };
    };
    const created = json.data?.auctionCreateds ?? [];
    const cancelledIds = new Set(
      (json.data?.auctionCancelleds ?? []).map((a) => a.auctionId),
    );
    const closedIds = new Set(
      (json.data?.auctionCloseds ?? []).map((a) => a.auctionId),
    );
    const open = created.filter(
      (a) => !cancelledIds.has(a.auctionId) && !closedIds.has(a.auctionId),
    );
    if (open.length > 0) {
      console.log(
        `[bid-debug] Found ${open.length} open auction(s): ${open.map((a) => `#${a.auctionId}`).join(", ")}`,
      );
    }
    return open[0]?.auctionId ?? null;
  } catch (err) {
    console.log(`[bid-debug] Subgraph query failed: ${err}`);
    return null;
  }
}

test.describe("Bid debug", () => {
  test("trace bid submission end-to-end", async ({ page }) => {
    // Find an auction to bid on
    const state = getTestState();
    let auctionId = state?.bidAuctionId || null;

    if (!auctionId) {
      console.log(
        "[bid-debug] No test state, querying subgraph for open auction...",
      );
      auctionId = await findOpenAuction();
    }

    if (!auctionId) {
      test.skip(true, "No open auction found on subgraph");
      return;
    }

    console.log(`[bid-debug] Using auction #${auctionId}`);

    // Collect all API requests and responses for debugging
    const apiLog: {
      url: string;
      method: string;
      status?: number;
      requestBody?: string;
      responseBody?: string;
    }[] = [];

    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/api/") || url.includes("localhost:3001")) {
        apiLog.push({
          url,
          method: req.method(),
          requestBody: req.postData() ?? undefined,
        });
      }
    });

    page.on("response", async (res) => {
      const url = res.url();
      if (url.includes("/api/") || url.includes("localhost:3001")) {
        const entry = apiLog.find(
          (e) => e.url === url && e.status === undefined,
        );
        if (entry) {
          entry.status = res.status();
          try {
            entry.responseBody = await res.text();
          } catch {
            entry.responseBody = "(could not read body)";
          }
        }
      }
    });

    // Capture console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // ── Step 1: Navigate to auction page ──
    console.log(`[bid-debug] Navigating to /auction/${auctionId}`);
    await page.goto(`/auction/${auctionId}`);

    // Retry if subgraph hasn't indexed yet
    const notFound = page.getByText("This page could not be found");
    const isNotFound = await notFound
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    if (isNotFound) {
      console.log("[bid-debug] Auction not indexed yet, waiting 15s...");
      await page.waitForTimeout(15_000);
      await page.goto(`/auction/${auctionId}`);
    }

    // Verify auction page loaded
    await expect(page.getByText(`#${auctionId}`).first()).toBeVisible({
      timeout: 15_000,
    });
    console.log("[bid-debug] Auction page loaded");

    // Check auction status — if not Open, skip
    const statusBadge = page.locator('[data-slot="badge"]').first();
    const statusText = await statusBadge.textContent();
    console.log(`[bid-debug] Auction status badge: "${statusText}"`);
    if (statusText && !["Open"].includes(statusText.trim())) {
      test.skip(true, `Auction status is "${statusText}", not "Open"`);
      return;
    }

    // ── Step 2: Unlock wallet ──
    const placeBidButton = page.getByRole("button", { name: "Place Bid" });
    const depositLink = page.getByRole("link", {
      name: "Deposit funds to bid",
    });

    await expect(async () => {
      const unlockButton = page.getByRole("button", { name: "Unlock wallet" });
      const unlockVisible = await unlockButton.isVisible().catch(() => false);
      if (unlockVisible) {
        console.log("[bid-debug] Clicking 'Unlock wallet'...");
        await unlockButton.click();
        await page.waitForTimeout(3_000);
      }

      // Check for "Loading balance..." state
      const loadingButton = page.getByRole("button", {
        name: "Loading balance",
      });
      const isLoading = await loadingButton.isVisible().catch(() => false);
      if (isLoading) {
        console.log("[bid-debug] Balance still loading (FHE decrypt)...");
        throw new Error("STILL_LOADING");
      }

      const needsDeposit = await depositLink.isVisible().catch(() => false);
      if (needsDeposit) {
        console.log("[bid-debug] Account needs deposit — not funded");
        throw new Error("NEEDS_DEPOSIT");
      }

      // Check for funding_unavailable (error state)
      const retryButton = page.getByRole("button", {
        name: "Retry funding snapshot",
      });
      const isError = await retryButton.isVisible().catch(() => false);
      if (isError) {
        console.log("[bid-debug] Funding unavailable — error state");
        // Log any error messages
        const errText = await page
          .locator(".text-destructive")
          .first()
          .textContent()
          .catch(() => null);
        console.log(`[bid-debug] Error text: ${errText}`);
        throw new Error("FUNDING_ERROR");
      }

      await expect(placeBidButton).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 90_000, intervals: [5_000] });

    // Check if we ended up needing deposit
    const finalNeedsDeposit = await depositLink.isVisible().catch(() => false);
    if (finalNeedsDeposit) {
      console.log(
        "[bid-debug] API log so far:",
        JSON.stringify(apiLog, null, 2),
      );
      test.skip(true, "Bidder1 not funded");
      return;
    }

    console.log("[bid-debug] Wallet unlocked, 'Place Bid' visible");

    // Check if balance is displayed
    const balanceSection = page.locator("text=Available balance").locator("..");
    const balanceVisible = await balanceSection
      .isVisible()
      .catch(() => false);
    if (balanceVisible) {
      const balanceText = await balanceSection.textContent();
      console.log(`[bid-debug] Balance: ${balanceText}`);
    } else {
      console.log("[bid-debug] No balance display visible");
    }

    // ── Step 3: Open bid modal ──
    await placeBidButton.click();
    console.log("[bid-debug] Clicked 'Place Bid'");

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    console.log("[bid-debug] Bid modal opened");

    // Log modal state
    const currentBidText = await dialog
      .getByText(/current bid|no bids/i)
      .first()
      .textContent()
      .catch(() => "not found");
    console.log(`[bid-debug] ${currentBidText}`);

    const availableText = await dialog
      .getByText(/available/i)
      .first()
      .textContent()
      .catch(() => "not found");
    console.log(`[bid-debug] ${availableText}`);

    // ── Step 4: Fill bid amount ──
    const bidAmountInput = page.locator("#bid-amount");
    await expect(bidAmountInput).toBeVisible();
    await bidAmountInput.fill("5");
    console.log("[bid-debug] Filled bid amount: $5");

    // Check if submit is enabled
    const modalSubmit = dialog.getByRole("button", { name: "Place Bid" });
    const isEnabled = await modalSubmit.isEnabled();
    console.log(`[bid-debug] Submit button enabled: ${isEnabled}`);

    if (!isEnabled) {
      // Try a higher amount in case $5 is below the minimum
      await bidAmountInput.clear();
      await bidAmountInput.fill("100");
      console.log("[bid-debug] Retrying with $100");
      await expect(modalSubmit).toBeEnabled({ timeout: 2_000 });
    }

    // ── Step 5: Submit bid ──
    const preBidLogCount = apiLog.length;
    await modalSubmit.click();
    console.log("[bid-debug] Clicked submit");

    // ── Step 6: Watch phases ──
    // Track which phase we enter
    const phases: string[] = [];

    const checkPhase = async () => {
      const signing = await dialog
        .getByText(/check your wallet|signing/i)
        .first()
        .isVisible()
        .catch(() => false);
      const submitting = await dialog
        .getByText(/submitting|placing bid/i)
        .first()
        .isVisible()
        .catch(() => false);
      const success = await page
        .getByText("Bid placed successfully")
        .first()
        .isVisible()
        .catch(() => false);
      const error = await dialog
        .locator(".text-destructive")
        .first()
        .isVisible()
        .catch(() => false);

      if (signing && !phases.includes("signing")) {
        phases.push("signing");
        console.log("[bid-debug] Phase: signing");
      }
      if (submitting && !phases.includes("submitting")) {
        phases.push("submitting");
        console.log("[bid-debug] Phase: submitting");
      }
      if (success && !phases.includes("success")) {
        phases.push("success");
        console.log("[bid-debug] Phase: success");
      }
      if (error && !phases.includes("error")) {
        phases.push("error");
        const errorText = await dialog
          .locator(".text-destructive")
          .first()
          .textContent();
        console.log(`[bid-debug] Phase: error — "${errorText}"`);
      }
    };

    // Poll phases for up to 120s (FHE bid submission can be slow)
    const outcome = await Promise.race([
      page
        .getByText("Bid placed successfully")
        .first()
        .waitFor({ timeout: 120_000 })
        .then(() => "success" as const),
      dialog
        .locator(".text-destructive")
        .first()
        .waitFor({ timeout: 120_000 })
        .then(() => "error" as const),
    ]).catch(() => "timeout" as const);

    await checkPhase();

    // ── Step 7: Log everything ──
    const bidApiCalls = apiLog.slice(preBidLogCount);
    console.log(
      "[bid-debug] API calls during bid submission:",
      JSON.stringify(bidApiCalls, null, 2),
    );

    if (consoleErrors.length > 0) {
      console.log(
        "[bid-debug] Browser console errors:",
        JSON.stringify(consoleErrors, null, 2),
      );
    }

    console.log(`[bid-debug] Phases observed: ${phases.join(" -> ")}`);
    console.log(`[bid-debug] Final outcome: ${outcome}`);

    if (outcome === "error") {
      const errorText = await dialog
        .locator(".text-destructive")
        .first()
        .textContent();
      console.log(`[bid-debug] Error message: "${errorText}"`);
    }

    if (outcome === "timeout") {
      console.log(
        "[bid-debug] TIMEOUT — Full API log:",
        JSON.stringify(apiLog, null, 2),
      );

      // Take a screenshot
      await page.screenshot({
        path: "test-results/bid-debug-timeout.png",
        fullPage: true,
      });
    }

    expect(outcome).toBe("success");
  });
});
