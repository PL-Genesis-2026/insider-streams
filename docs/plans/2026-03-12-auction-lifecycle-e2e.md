# Auction Lifecycle E2E Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Playwright E2E tests covering bid, outbid, auction cancel, and auction close — all verified against live Sepolia + daemon.

**Architecture:** A shared helper module (`e2e/helpers.ts`) provides programmatic daemon API calls (signed with viem accounts). Global setup creates auctions and funds test accounts. A single test file (`e2e/auction-lifecycle.spec.ts`) runs 4 sequential tests using different wallets per flow.

**Tech Stack:** Playwright, viem, fast-json-stable-stringify, @johanneskares/wallet-mock (patched for EIP-712), live Sepolia testnet, daemon at localhost:3001

---

### Task 1: Create `e2e/helpers.ts` — programmatic daemon API helper

**Files:**
- Create: `apps/insider-streams-frontend/e2e/helpers.ts`

**Step 1: Write the helper module**

This module lets tests call daemon endpoints programmatically (from Node.js, not the browser). It signs requests the same way the frontend does: `fast-json-stable-stringify(payload)` → `personal_sign` → POST with `{ ...payload, signature }`.

```typescript
import stringify from "fast-json-stable-stringify";
import { type PrivateKeyAccount } from "viem/accounts";

const DAEMON_URL = "http://localhost:3001";

/** Sign a payload and POST it to the daemon. */
export async function signedDaemonRequest(
  path: string,
  account: PrivateKeyAccount,
  fields: Record<string, unknown> = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = { ...fields, timestamp };
  const message = stringify(payload);
  const signature = await account.signMessage({ message });

  const res = await fetch(`${DAEMON_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, signature }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

/** Deposit funds for a test account. Returns immediately (FHE tx is async). */
export async function depositFunds(
  account: PrivateKeyAccount,
  amountUsdc: number,
) {
  const amount = String(amountUsdc * 1_000_000); // 6 decimals
  return signedDaemonRequest("/deposit", account, { amount });
}

/** Create an auction via daemon. Waits for on-chain tx. */
export async function createAuctionViaApi(
  account: PrivateKeyAccount,
  opts: {
    eventId: string;
    eventTitle: string;
    privateLeg: "yes" | "no";
    secretPayload: string;
    duration: string;
  },
) {
  // The frontend proxy route transforms these fields, but we call daemon directly
  // so we must send daemon-format fields
  const timestamp = Math.floor(Date.now() / 1000);
  const durationSeconds: Record<string, number> = {
    "5m": 300, "15m": 900, "30m": 1800, "1h": 3600,
    "3h": 10800, "6h": 21600, "12h": 43200, "24h": 86400, "48h": 172800,
  };
  const endTime = String(timestamp + (durationSeconds[opts.duration] ?? 300));

  // Generate CID/key from secretPayload (same as daemon does internally)
  const { createHash, randomBytes } = await import("node:crypto");
  const secretDataKey = "0x" + randomBytes(32).toString("hex");
  const secretDataCid = "0x" + createHash("sha256").update(opts.secretPayload).digest("hex");

  return signedDaemonRequest("/create-auction", account, {
    eventId: opts.eventId,
    eventTitle: opts.eventTitle,
    endTime,
    prediction: opts.privateLeg === "yes" ? "true" : "false",
    secretDataCid,
    secretDataKey,
    secretPayload: opts.secretPayload,
  });
}

/** Poll daemon /balance until it's >= minBalance (in raw 6-decimal units). */
export async function waitForBalance(
  account: PrivateKeyAccount,
  minBalance: bigint,
  timeoutMs = 120_000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await signedDaemonRequest("/balance", account);
    const balance = BigInt((data.balance as string) ?? "0");
    if (balance >= minBalance) return balance.toString();
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`Balance did not reach ${minBalance} within ${timeoutMs}ms`);
}
```

**Step 2: Commit**

```bash
git add apps/insider-streams-frontend/e2e/helpers.ts
git commit -m "feat(e2e): add programmatic daemon API helpers for test setup"
```

---

### Task 2: Add test accounts to fixtures

**Files:**
- Modify: `apps/insider-streams-frontend/e2e/fixtures.ts:9-19`

**Step 1: Add accounts 4-6 to TEST_ACCOUNTS**

Add these entries to the `TEST_ACCOUNTS` object:

```typescript
export const TEST_ACCOUNTS = {
  // ... existing entries ...
  // TEST_ACCOUNT_4 — bid tests (bidder 1)
  bidder1:
    "0x732d878d1d4b8bb7c61eab6f78f74b1f163aa2c59c29f181049ae3209bd8deb4" as const,
  // TEST_ACCOUNT_5 — outbid tests (bidder 2)
  bidder2:
    "0xf319763080f34fc16dcc15412070dfcf29bea92c2cbf549fc8a6e87412602573" as const,
  // TEST_ACCOUNT_6 — cancel/close viewer
  viewer:
    "0xf1dcd38ac8cbe9a2d622d2af8fde9397fc7995f48bdc6e18aceaaab7e2248072" as const,
};
```

**Step 2: Commit**

```bash
git add apps/insider-streams-frontend/e2e/fixtures.ts
git commit -m "feat(e2e): add bidder and viewer test accounts to fixtures"
```

---

### Task 3: Extend global setup to create auctions and fund bidders

**Files:**
- Modify: `apps/insider-streams-frontend/e2e/global-setup.ts`

**Step 1: Add auction creation and deposit funding**

After the existing prediction market event creation, add:

1. Create a test auction via daemon API (for bid/outbid tests)
2. Create a short-duration auction (for close test — 5 min duration)
3. Deposit funds for bidder1 and bidder2 accounts
4. Write auction IDs and event info to a shared state file so tests can read them

Use `JSON.stringify()` to write state to `e2e/.test-state.json`:

```typescript
import { writeFileSync } from "node:fs";
// ... at end of globalSetup():

// Fund bidder accounts and create test auctions
const testState = {
  eventId: String(nextEventId), // the event we just created (or found)
  eventTitle: question,         // the event question
  // auctionIds get populated below
  bidAuctionId: "",
  closeAuctionId: "",
};

// Write state for tests to consume
writeFileSync(
  resolve(__dirname, ".test-state.json"),
  JSON.stringify(testState, null, 2),
);
```

The auctions and deposits are created using the helpers from Task 1.

**Key details:**
- `bidAuction`: 24h duration, for bid + outbid tests
- `closeAuction`: 5m duration, expires quickly for close test
- Bidder1 and bidder2 each get 100 USDC deposited (daemon `/deposit`)
- Wait for deposits to confirm by polling `/balance`
- The cancel test creates its own auction inline (needs fresh one each run)

**Step 2: Commit**

```bash
git add apps/insider-streams-frontend/e2e/global-setup.ts
git commit -m "feat(e2e): extend global setup with auctions and funded bidders"
```

---

### Task 4: Write bid test

**Files:**
- Create: `apps/insider-streams-frontend/e2e/auction-lifecycle.spec.ts`

**Step 1: Write the bid test**

```typescript
import { test, expect, TEST_ACCOUNTS } from "./fixtures";

test.use({ walletPrivateKey: TEST_ACCOUNTS.bidder1 });

test.describe("Auction lifecycle", () => {
  test("place a bid on an open auction", async ({ page }) => {
    // Read auction ID from test state
    // Navigate to /auction/<auctionId>
    // Unlock wallet (click "Unlock wallet" button in bid gate)
    // Wait for "Place Bid" button to appear (funded status)
    // Click "Place Bid" — opens BidModal dialog
    // Fill bid amount (e.g., 5 USDC)
    // Click "Place Bid" in modal
    // Wait for "Bid placed successfully" message
    // Verify bid appears in bid history
  });
});
```

**UI interaction flow on auction page:**
1. `page.goto("/auction/<auctionId>")`
2. Wait for "Bid access" label
3. Click "Unlock wallet" button (triggers personal_sign for private data reveal)
4. Wait for "Place Bid" button to appear (funding snapshot resolves)
5. Click "Place Bid" → BidModal dialog opens
6. Fill `#bid-amount` input with amount
7. Click dialog's "Place Bid" button
8. Wait for "Bid placed successfully" text
9. Verify bid history shows the bid amount

**Step 2: Run test, verify it passes**

```bash
pnpm exec playwright test auction-lifecycle
```

**Step 3: Commit**

```bash
git add apps/insider-streams-frontend/e2e/auction-lifecycle.spec.ts
git commit -m "feat(e2e): add bid placement test"
```

---

### Task 5: Write outbid test

**Files:**
- Modify: `apps/insider-streams-frontend/e2e/auction-lifecycle.spec.ts`

**Step 1: Add outbid test**

This test uses `bidder2`'s wallet on the **same auction** as the bid test. It must place a higher bid. Since Playwright uses `test.use()` at file level and we need different wallets per test, we have two options:

**Approach:** Use a separate spec file for the outbid test since `test.use()` applies to the whole file.

Create `e2e/auction-outbid.spec.ts`:

```typescript
import { test, expect, TEST_ACCOUNTS } from "./fixtures";

test.use({ walletPrivateKey: TEST_ACCOUNTS.bidder2 });

test.describe("Outbid flow", () => {
  test("outbid the current leader with a higher bid", async ({ page }) => {
    // Read same auction ID from test state
    // Navigate to /auction/<auctionId>
    // Unlock wallet
    // Wait for "Place Bid" button
    // Click "Place Bid" → BidModal
    // Fill higher amount (e.g., 10 USDC, above the 5 from bid test)
    // Click "Place Bid"
    // Wait for "Bid placed successfully"
    // Verify bid history shows the new higher bid
  });
});
```

**Step 2: Run, verify**

```bash
pnpm exec playwright test auction-outbid
```

**Step 3: Commit**

```bash
git add apps/insider-streams-frontend/e2e/auction-outbid.spec.ts
git commit -m "feat(e2e): add outbid test"
```

---

### Task 6: Write auction cancel test

**Files:**
- Create: `apps/insider-streams-frontend/e2e/auction-cancel.spec.ts`

**Step 1: Write cancel test**

Cancel is admin-only (no UI). This test:
1. Creates an auction programmatically in a `test.beforeAll`
2. Calls `cancelAuction()` on the contract directly from the admin wallet (viem)
3. Navigates to the auction page and verifies "Cancelled" badge

```typescript
import { test, expect, TEST_ACCOUNTS } from "./fixtures";
import { privateKeyToAccount } from "viem/accounts";
import { createAuctionViaApi } from "./helpers";

test.use({ walletPrivateKey: TEST_ACCOUNTS.viewer });

test.describe("Auction cancel", () => {
  // Create + cancel an auction programmatically, then verify UI
  test("cancelled auction shows Cancelled status on auction page", async ({ page }) => {
    // 1. Read test state for eventId
    // 2. Create a fresh auction via daemon API (from viewer account)
    // 3. Cancel it via direct contract call (admin wallet)
    // 4. Navigate to /auction/<auctionId>
    // 5. Verify Badge shows "Cancelled"
    // 6. Verify timeline shows "Auction cancelled"
  });
});
```

**Contract call for cancel:**
```typescript
import { createWalletClient, createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { fheSecretMarketplaceAbi, SECRET_MARKETPLACE_ADDRESS } from "@private-streams/common";

const adminAccount = privateKeyToAccount(process.env.OWNER_PK as `0x${string}`);
const walletClient = createWalletClient({ account: adminAccount, chain: sepolia, transport: http() });

await walletClient.writeContract({
  address: SECRET_MARKETPLACE_ADDRESS as `0x${string}`,
  abi: fheSecretMarketplaceAbi,
  functionName: "cancelAuction",
  args: [BigInt(auctionId)],
});
```

**Step 2: Run, verify**

**Step 3: Commit**

---

### Task 7: Write auction close test

**Files:**
- Create: `apps/insider-streams-frontend/e2e/auction-close.spec.ts`

**Step 1: Write close test**

Close is daemon-driven. This test:
1. Reads the short-duration auction from test state (created in global setup with 5min duration)
2. Waits for it to expire (polling `getAuction()` endTime)
3. Calls `closeAuction()` on contract directly (admin wallet) — faster than waiting for daemon cron
4. Waits for the subgraph to index (poll the auction page)
5. Navigates to auction page, verifies "Closed" badge

```typescript
test.describe("Auction close", () => {
  test("closed auction shows Closed status on auction page", async ({ page }) => {
    // 1. Read closeAuctionId from test state
    // 2. Wait for auction to expire (poll contract endTime vs now)
    // 3. Call closeAuction() from admin wallet
    // 4. Wait for subgraph to index (~30s)
    // 5. Navigate to /auction/<closeAuctionId>
    // 6. Verify Badge shows "Closed"
    // 7. Verify timeline shows "Auction closed"
  });
});
```

**Step 2: Run, verify**

**Step 3: Commit**

---

### Task 8: Configure test ordering in playwright.config.ts

**Files:**
- Modify: `apps/insider-streams-frontend/playwright.config.ts`

**Step 1: Ensure correct test execution order**

Tests must run in this order: bid → outbid → cancel → close (bid before outbid is critical). Use Playwright's `testDir` file ordering or explicit project dependencies.

The simplest approach: Playwright runs files alphabetically within `testDir: "./e2e"`. Name files to ensure order:
- `auction-lifecycle.spec.ts` (bid) — runs first
- `auction-outbid.spec.ts` — runs second
- `auction-cancel.spec.ts` — runs third
- `auction-close.spec.ts` — runs last (may wait for expiry)

Since `workers: 1` is already set, tests run serially in alphabetical order. This gives us:
1. `auction-cancel.spec.ts`
2. `auction-close.spec.ts`
3. `auction-lifecycle.spec.ts` (bid)
4. `auction-outbid.spec.ts`
5. `create-auction.spec.ts`
6. `deposit.spec.ts`
7. `wallet-connect.spec.ts`

Cancel/close don't depend on bid, so this order is fine. Bid runs before outbid ✓.

**Step 2: Add `.test-state.json` to `.gitignore`**

**Step 3: Commit**

---

### Task 9: Run full suite, fix issues

**Step 1: Run all tests**

```bash
cd apps/insider-streams-frontend && pnpm exec playwright test
```

**Step 2: Fix any failures**

Common issues to watch for:
- Subgraph indexing delay (auction status not yet updated) — add polling/retry
- FHE deposit not confirmed before bid — increase `waitForBalance` timeout
- Auction close test timing — may need to wait for expiry

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(e2e): complete auction lifecycle E2E tests (bid, outbid, cancel, close)"
```
