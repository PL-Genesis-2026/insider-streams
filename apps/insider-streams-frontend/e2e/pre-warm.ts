/**
 * Pre-warm script for E2E tests.
 *
 * Runs before Playwright tests to:
 * 1. Register all test accounts with the daemon (triggers user creation)
 * 2. Warm FHE balance decrypt cache for bidder accounts
 * 3. Find an open auction with sufficient time remaining
 * 4. Write .test-state.json so tests skip subgraph queries
 *
 * Usage:
 *   npx tsx e2e/pre-warm.ts
 *
 * Requires daemon running (without heavy demo mode load ideally).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import stringify from "fast-json-stable-stringify";
import { TEST_ACCOUNTS } from "./fixtures";
import { findOpenAuctions, signedDaemonRequest } from "./helpers";

const STATE_PATH = resolve(__dirname, ".test-state.json");

async function warmAccount(
  name: string,
  pk: `0x${string}`,
  needsBalance: boolean,
) {
  const account = privateKeyToAccount(pk);
  console.log(`[pre-warm] ${name}: ${account.address}`);

  // Step 1: Register user (POST /user triggers getOrCreateUser in daemon)
  try {
    const { status, data } = await signedDaemonRequest("/user", account, {}, 30_000);
    console.log(`  /user: ${status} userId=${data.userId ?? "?"}`);
  } catch (err: any) {
    console.log(`  /user: ERROR ${err.message}`);
  }

  if (!needsBalance) return;

  // Step 2: Request balance (triggers FHE decrypt, warms cache)
  try {
    const { status, data } = await signedDaemonRequest("/balance", account, {}, 90_000);
    const bal = data.balance ?? "unavailable";
    const err = data.error ? ` (${data.error})` : "";
    console.log(`  /balance: ${status} balance=${bal}${err}`);
  } catch (err: any) {
    console.log(`  /balance: ERROR ${err.message}`);
  }
}

async function main() {
  console.log("[pre-warm] Starting E2E test pre-warm...\n");

  // Check daemon health
  try {
    const daemonUrl = process.env.DAEMON_URL || "http://localhost:3001";
    const res = await fetch(`${daemonUrl}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log("[pre-warm] Daemon is healthy\n");
  } catch (err: any) {
    console.error(`[pre-warm] Daemon not reachable: ${err.message}`);
    console.error("[pre-warm] Start daemon first: cd apps/daemon && pnpm start");
    process.exit(1);
  }

  // Warm accounts sequentially to avoid overwhelming the daemon's admin lock.
  // Bidder accounts need balance; others just need registration.
  const accountsToWarm: [string, `0x${string}`, boolean][] = [
    ["bidder1", TEST_ACCOUNTS.bidder1, true],
    ["bidder2", TEST_ACCOUNTS.bidder2, true],
    ["default", TEST_ACCOUNTS.default, false],
    ["deposit", TEST_ACCOUNTS.deposit, false],
    ["createAuction", TEST_ACCOUNTS.createAuction, false],
    ["viewer", TEST_ACCOUNTS.viewer, false],
  ];

  for (const [name, pk, needsBal] of accountsToWarm) {
    await warmAccount(name, pk, needsBal);
  }

  // Find an open auction with at least 10 min remaining
  console.log("\n[pre-warm] Finding open auctions...");
  const auctions = await findOpenAuctions(20, 600);

  if (auctions.length === 0) {
    console.log("[pre-warm] No open auctions found with 10+ min remaining.");
    console.log("[pre-warm] Tests will query subgraph at runtime or skip.");
  } else {
    // Prefer the auction with the most time remaining
    const best = auctions.reduce((a, b) =>
      Number(a.endTime) > Number(b.endTime) ? a : b,
    );
    const remaining = Number(best.endTime) - Math.floor(Date.now() / 1000);
    console.log(
      `[pre-warm] Best auction: #${best.auctionId} (${Math.round(remaining / 60)} min remaining)`,
    );

    // Write test state
    const state = {
      eventId: "0",
      eventTitle: "pre-warm",
      bidAuctionId: best.auctionId,
      closeAuctionId: "",
    };
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    console.log(`[pre-warm] Wrote ${STATE_PATH}`);
  }

  console.log("\n[pre-warm] Done! Ready for E2E tests.");
}

main().catch((err) => {
  console.error("[pre-warm] Fatal:", err);
  process.exit(1);
});
