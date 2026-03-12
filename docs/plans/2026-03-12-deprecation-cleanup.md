# Deprecation Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all deprecated CRE/Foundry/Private Token API/Supabase/event-watcher code, port missing functionality to the daemon architecture, and update remaining scripts + docs for the Zama fhEVM + daemon system.

**Architecture:** The project migrated from Chainlink CRE workflows + Foundry contracts + Supabase + Private Token API to Zama fhEVM Hardhat contracts (`contracts-fhe/`) + a unified daemon (`apps/daemon/`). All the old infrastructure is dead code. This plan first ports any missing functionality (bid status tracking, cancellation watcher, settlement requester, bid generator), then deletes deprecated code, and finally updates documentation.

**Tech Stack:** pnpm monorepo, Turborepo, TypeScript, Hardhat (contracts-fhe), The Graph subgraph, Next.js frontend, Playwright E2E tests, Express daemon (apps/daemon)

---

## Phase A: Port Missing Functionality and Fix Tests

These tasks add functionality that existed in the old CRE/Supabase system but is missing from the daemon, fix pre-existing test failures, and add unit tests. Must be done BEFORE deleting old code so we can reference it.

---

### Task 0: Fix pre-existing e2e-api.test.ts failures and api.ts validation

Two of 51 e2e tests fail because the create-auction tests don't provide `prediction`/`secretPayload` fields. The API also returns 200 for missing-fields errors instead of 400.

**DONE** — Already implemented and verified (52/52 tests pass).

**Files:**
- Modified: `apps/daemon/src/api.ts:267` — changed `res.json(...)` to `res.status(400).json(...)` for "Missing prediction or secret data" error
- Modified: `apps/daemon/src/e2e-api.test.ts` — updated "auto-creates seller user" test to provide `prediction` + `secretPayload`, expect 500/FHE_TX_FAILED (daemon isn't contract owner in test mode), verify user creation via follow-up `/user` call. Added new "rejects missing prediction/secret data" test expecting 400/MISSING_FIELDS. Updated multi-user lifecycle test similarly.

---

### Task 1: Fix auction-closer to mark winning bids in SQLite

After `closeAuction()` succeeds, the daemon never updates the winning bid's status in SQLite. The `markBidsForAuction()` function exists in `db.ts:204` but is never called.

**DONE** — Already implemented and verified.

**Files:**
- Modified: `apps/daemon/src/auction-closer.ts`

Changes:
1. Added `import { markBidsForAuction } from "./db.js";`
2. Added `markBidsForAuction(Number(auctionId), "won");` after successful `closeAuction()`, before `sendNotification`

---

### Task 2: Add AuctionCancelled watcher to daemon

When an auction is cancelled (admin calls `cancelAuction()` on the contract), the active bid should be marked as "cancelled" in SQLite. The old CRE workflow `auction-cancelled-handler` did this via Supabase. We need a simple event watcher in the daemon.

**DONE** — Already implemented and verified.

**Files:**
- Modified: `apps/daemon/src/auction-closer.ts` (added to the existing closer service)

Changes: Added `watchContractEvent` for `AuctionCancelled` at the end of `startAuctionCloser()`, which calls `markBidsForAuction(Number(auctionId), "cancelled")` for each event.

---

### Task 2a: Add db.test.ts unit tests for bid status tracking

Unit tests for `recordBid()` outbid tracking and `markBidsForAuction()` won/cancelled/no-op behavior. These functions are called by background services (auction-closer), not by API endpoints, so they can't be tested through the HTTP API.

**DONE** — Already implemented and verified (11/11 tests pass).

**Files:**
- Created: `apps/daemon/src/db.test.ts` (11 tests across 4 describe blocks)
- Modified: `apps/daemon/package.json` — added `"test:db": "node --import tsx --test src/db.test.ts"` script

Tests cover:
- `recordBid` outbid tracking: first bid active, second marks first as outbid, third marks second, cross-auction independence
- `markBidsForAuction("won")`: active→won, outbid untouched, other auctions untouched
- `markBidsForAuction("cancelled")`: active→cancelled, outbid untouched
- No-op cases: no bids, already-resolved bids

**Verification commands:**

```bash
cd apps/daemon && pnpm test:db    # 11/11 pass
cd apps/daemon && pnpm test:e2e   # 52/52 pass
cd apps/daemon && pnpm build      # compiles clean
```

---

### Task 2b: Commit Tasks 0-2a

All changes from Tasks 0-2a are uncommitted. Commit them together.

**Step 1: Commit**

```bash
git add apps/daemon/src/auction-closer.ts apps/daemon/src/api.ts apps/daemon/src/e2e-api.test.ts apps/daemon/src/db.test.ts apps/daemon/package.json
git commit -m "fix: bid status tracking, AuctionCancelled watcher, e2e test fixes, db unit tests"
```

---

### Task 3: Fix request-settlements.ts for Zama subgraph

The `request-settlements.ts` script finds closed-but-unsettled prediction market events and calls `requestSettlement()` for each. The settler daemon watches for the resulting `SettlementRequested` events and handles AI settlement. This script is the missing link that triggers the whole settlement pipeline.

**Files:**
- Modify: `scripts/request-settlements.ts:41-43` (subgraph URL)

**Step 1: Update the subgraph URL**

Change lines 41-43 from:

```typescript
const SUBGRAPH_URL =
  process.env.SUBGRAPH_URL ??
  "https://gateway.thegraph.com/api/a075bc6e2e48577d2588bb458b939bdc/subgraphs/id/2vVUkMCH5m48s8Qj1ChgR2z3c98vAX3raBoJoYZ9RrBW";
```

To:

```typescript
const SUBGRAPH_URL =
  process.env.SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/1743303/insider-streams-zama/version/latest";
```

**Step 2: Verify it compiles**

```bash
cd scripts && pnpm build
```

**Step 3: Commit**

```bash
git add scripts/request-settlements.ts
git commit -m "fix: update request-settlements.ts to use insider-streams-zama subgraph"
```

---

### Task 4: Integrate request-settlements into run-demo.sh

The settlement pipeline needs `request-settlements.ts` running periodically so that closed events get their `SettlementRequested` event emitted, which the daemon's settler picks up. Add it as a background loop in `run-demo.sh`.

**Files:**
- Modify: `scripts/run-demo.sh`

**Step 1: Add request-settlements loop**

Add a new background loop after the spawn-auctions loop (after line 60). Also update the header comment and add a `REQUEST_SETTLEMENTS_PID` variable:

Update line 9 to include request-settlements in the order description:

```bash
#   3. request-settlements — background loop, requests settlement for closed events
#   4. create-events  — re-runs on a background loop to add fresh events
```

After line 25, add:

```bash
REQUEST_SETTLEMENTS_INTERVAL_S=$(( ${REQUEST_SETTLEMENTS_INTERVAL_MS:-120000} / 1000 ))
```

Update `cleanup()` to kill the new process, and add `REQUEST_SETTLEMENTS_PID=""` alongside the other PID vars.

After the spawn-auctions loop block, add:

```bash
# ── 3. Periodic request-settlements ──────────────────────────────────────────
(
  while true; do
    sleep "$REQUEST_SETTLEMENTS_INTERVAL_S"
    pnpm run request-settlements || echo "[run-demo] request-settlements failed — continuing"
  done
) &
REQUEST_SETTLEMENTS_PID=$!
echo "[run-demo] request-settlements loop started (PID $REQUEST_SETTLEMENTS_PID)"
```

Update the `wait` line to include the new PID.

**Step 2: Commit**

```bash
git add scripts/run-demo.sh
git commit -m "feat: add request-settlements loop to run-demo.sh"
```

---

### Task 5: Rewrite place-bids.ts for daemon architecture

The old `place-bids.ts` (500 lines, deleted on this branch) used Supabase + Private Token API to query bid data and fund accounts. The new version should:
1. Use the daemon's HTTP API (`/bid`, `/deposit`, `/faucet`, `/balance`) instead of Supabase
2. Sign requests using test account private keys (same `verifySignedRequest` convention)
3. Query the subgraph for open auctions (same as before)
4. Query daemon for each account's balance and top up via `/faucet` + `/deposit` if needed

**Files:**
- Create: `scripts/place-bids.ts`

**Step 1: Write the script**

```typescript
#!/usr/bin/env tsx
/**
 * place-bids.ts — Demo daemon that places bids on open auctions.
 *
 * Uses the daemon HTTP API (not Supabase) to place bids and check balances.
 * Runs once per invocation; scheduling is handled by run-demo.sh.
 *
 * Flow:
 *   1. Load test accounts from env (TEST_ACCOUNT_1..25)
 *   2. Query subgraph for open auctions
 *   3. For each auction, find a test account that isn't the seller
 *   4. Check balance via daemon /balance, top up via /faucet + /deposit if needed
 *   5. Place bid via daemon /bid
 *
 * Env vars (scripts/.env):
 *   TEST_ACCOUNT_1..25  — private keys for bidding accounts
 *   BASE_URL            — daemon/frontend origin (default: http://localhost:3001)
 *   SUBGRAPH_URL        — subgraph endpoint (default: insider-streams-zama)
 */

import stringify from "fast-json-stable-stringify";
import { GraphQLClient, gql } from "graphql-request";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, type Hex } from "viem";
import { sepolia } from "viem/chains";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUBGRAPH_URL = process.env.SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/1743303/insider-streams-zama/version/latest";

const DAEMON_URL =
  process.env.DAEMON_URL ??
  process.env.BASE_URL ??
  "http://localhost:3001";

const MIN_BID_INCREMENT = 10_000_000n;  // 10 USDC (6 decimals)
const MAX_BID_INCREMENT = 50_000_000n;  // 50 USDC
const LOW_BALANCE_THRESHOLD = 100_000_000n; // 100 USDC

// ---------------------------------------------------------------------------
// ntfy (optional)
// ---------------------------------------------------------------------------

const ENABLE_NTFY = process.env.ENABLE_NTFY === "true";
const NTFY_HOST = process.env.NTFY_HOST ?? "http://localhost:8090";
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "place-bids";
const NTFY_USER = process.env.NTFY_USER ?? "UNKNOWN";

async function ntfy(title: string, message: string, tags?: string[]) {
  if (!ENABLE_NTFY) return;
  try {
    await fetch(`${NTFY_HOST}/${NTFY_TOPIC}`, {
      method: "POST",
      headers: { Title: title, ...(tags?.length ? { Tags: tags.join(",") } : {}) },
      body: `[${NTFY_USER}] ${message}`,
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Test accounts
// ---------------------------------------------------------------------------

interface TestAccount {
  privateKey: Hex;
  address: string;
  walletClient: ReturnType<typeof createWalletClient>;
}

function loadTestAccounts(): TestAccount[] {
  const accounts: TestAccount[] = [];
  for (let i = 1; i <= 25; i++) {
    const pk = process.env[`TEST_ACCOUNT_${i}`];
    if (!pk) continue;
    const account = privateKeyToAccount(pk as Hex);
    accounts.push({
      privateKey: pk as Hex,
      address: account.address,
      walletClient: createWalletClient({
        account,
        chain: sepolia,
        transport: http(process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com"),
      }),
    });
  }
  return accounts;
}

// ---------------------------------------------------------------------------
// Daemon API helpers
// ---------------------------------------------------------------------------

async function signedPost(account: TestAccount, endpoint: string, fields: Record<string, unknown> = {}): Promise<Response> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = { ...fields, timestamp };
  const message = stringify(payload);
  const signature = await account.walletClient.signMessage({ message });

  return fetch(`${DAEMON_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, signature }),
    signal: AbortSignal.timeout(30_000),
  });
}

async function ensureBalance(account: TestAccount): Promise<bigint> {
  // Register user first
  await signedPost(account, "/user");

  // Check balance
  const balResp = await signedPost(account, "/balance");
  const balData = await balResp.json();
  const balance = BigInt(balData.balance ?? "0");

  if (balance < LOW_BALANCE_THRESHOLD) {
    console.log(`  [place-bids] ${account.address.slice(0, 10)}... balance ${balance} < threshold, topping up via faucet + deposit`);

    // Mint MockUSDC via faucet
    const faucetResp = await signedPost(account, "/faucet");
    if (!faucetResp.ok) {
      console.warn(`  [place-bids] faucet failed for ${account.address.slice(0, 10)}...`);
      return balance;
    }
    const faucetData = await faucetResp.json();
    const mintAmount = faucetData.amount ?? "1000000000";

    // Deposit into marketplace
    const depositResp = await signedPost(account, "/deposit", {
      txHash: faucetData.txHash ?? "0x",
      amount: mintAmount,
    });
    if (!depositResp.ok) {
      console.warn(`  [place-bids] deposit failed for ${account.address.slice(0, 10)}...`);
    }

    return BigInt(mintAmount) + balance;
  }

  return balance;
}

// ---------------------------------------------------------------------------
// Subgraph
// ---------------------------------------------------------------------------

const OPEN_AUCTIONS_QUERY = gql`
  query OpenAuctions($now: BigInt!) {
    auctionCreateds(
      where: { endTime_gt: $now }
      first: 100
      orderBy: endTime
      orderDirection: asc
    ) {
      auctionId
      sellerId
      endTime
    }
  }
`;

type OpenAuctionsResponse = {
  auctionCreateds: { auctionId: string; sellerId: string; endTime: string }[];
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("[place-bids] starting...");
  console.log(`[place-bids] daemon: ${DAEMON_URL}`);
  console.log(`[place-bids] subgraph: ${SUBGRAPH_URL}`);

  const accounts = loadTestAccounts();
  if (accounts.length === 0) {
    console.error("[place-bids] No test accounts found (TEST_ACCOUNT_1..25)");
    process.exit(1);
  }
  console.log(`[place-bids] Loaded ${accounts.length} test account(s)`);

  const gqlClient = new GraphQLClient(SUBGRAPH_URL);
  const now = Math.floor(Date.now() / 1000).toString();

  let auctions: OpenAuctionsResponse["auctionCreateds"];
  try {
    const data = await gqlClient.request<OpenAuctionsResponse>(OPEN_AUCTIONS_QUERY, { now });
    auctions = data.auctionCreateds;
  } catch (err) {
    console.error("[place-bids] subgraph query failed:", err);
    process.exit(1);
  }

  if (auctions.length === 0) {
    console.log("[place-bids] No open auctions found");
    return;
  }

  console.log(`[place-bids] Found ${auctions.length} open auction(s)`);

  // Shuffle auctions for variety
  for (let i = auctions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [auctions[i], auctions[j]] = [auctions[j], auctions[i]];
  }

  let bidsPlaced = 0;

  for (const auction of auctions) {
    // Pick a random account (skip if it's the seller — but we can't know which
    // test account is the seller by address alone since daemon uses pseudonymous IDs.
    // We'll just pick a random account and let the daemon reject if same user.)
    const account = accounts[Math.floor(Math.random() * accounts.length)];

    try {
      const balance = await ensureBalance(account);
      if (balance < MIN_BID_INCREMENT) {
        console.log(`  [place-bids] Skipping auction ${auction.auctionId} — insufficient balance`);
        continue;
      }

      // Random bid amount between MIN and MAX increment
      const range = MAX_BID_INCREMENT - MIN_BID_INCREMENT;
      const bidAmount = MIN_BID_INCREMENT + BigInt(Math.floor(Math.random() * Number(range)));

      console.log(`  [place-bids] Bidding ${bidAmount} on auction ${auction.auctionId} from ${account.address.slice(0, 10)}...`);

      const resp = await signedPost(account, "/bid", {
        auctionId: auction.auctionId,
        amount: bidAmount.toString(),
      });

      if (resp.ok) {
        const data = await resp.json();
        console.log(`  [place-bids] Bid placed: bidId=${data.bidId}, status=${data.status}`);
        bidsPlaced++;
      } else {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        console.warn(`  [place-bids] Bid rejected for auction ${auction.auctionId}: ${err.error}`);
      }
    } catch (err) {
      console.error(`  [place-bids] Error on auction ${auction.auctionId}:`, err instanceof Error ? err.message : err);
    }
  }

  const summary = `Placed ${bidsPlaced} bid(s) across ${auctions.length} auction(s)`;
  console.log(`[place-bids] ${summary}`);
  await ntfy("Bids Placed", summary, bidsPlaced > 0 ? ["white_check_mark"] : ["warning"]);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[place-bids] fatal:", err);
    ntfy("Place Bids FATAL", `${err}`, ["x"]).finally(() => process.exit(1));
  });
```

**Step 2: Add script entry to `scripts/package.json`**

Add to the `"scripts"` section:

```json
"place-bids": "tsx --env-file=.env place-bids.ts",
```

**Step 3: Add place-bids loop to run-demo.sh**

After the spawn-auctions loop and before the create-events refresh loop, add:

```bash
# ── 3. Periodic place-bids ───────────────────────────────────────────────────
(
  while true; do
    sleep "$SPAWN_INTERVAL_S"
    pnpm run place-bids || echo "[run-demo] place-bids failed — continuing"
  done
) &
BIDS_PID=$!
echo "[run-demo] place-bids loop started (PID $BIDS_PID)"
```

Add `BIDS_PID=""` to the PID declarations and add it to `cleanup()` and `wait`.

**Step 4: Verify it compiles**

```bash
cd scripts && pnpm build
```

**Step 5: Commit**

```bash
git add scripts/place-bids.ts scripts/package.json scripts/run-demo.sh
git commit -m "feat: rewrite place-bids.ts for daemon architecture, integrate into run-demo.sh"
```

---

## Phase B: Delete Deprecated Code

---

### Task 6: Delete CRE workflows directory

All 5 CRE workflows have explicit deprecation notices. The daemon replaces every one of them.

**Files:**
- Delete: `cre-workflows/` (entire directory — 5 workflow subdirs + project.yaml, secrets.yaml, README.md)

**Step 1: Delete the directory**

```bash
rm -rf cre-workflows/
```

**Step 2: Verify nothing references the deleted directory at import level**

```bash
grep -r "cre-workflows" --include='*.ts' --include='*.json' --include='*.yaml' . | grep -v node_modules | grep -v .git | grep -v .worktrees
```

Expected: Only hits in `CLAUDE.md`, `README.md`, `scripts/deploy.sh`, and `scripts/cre-runner.ts` (all handled in later tasks).

**Step 3: Commit**

```bash
git add -A cre-workflows/
git commit -m "chore: delete deprecated CRE workflows (replaced by daemon)"
```

---

### Task 7: Delete event-watcher app

The event watcher only existed to trigger CRE workflow simulations. Has explicit deprecation notice.

**Files:**
- Delete: `apps/event-watcher/` (entire directory)

**Step 1: Delete the directory**

```bash
rm -rf apps/event-watcher/
```

**Step 2: Commit**

```bash
git add -A apps/event-watcher/
git commit -m "chore: delete deprecated event-watcher (CRE simulation trigger)"
```

---

### Task 8: Delete Private Token API client package

No source files remain (`src/` was already deleted). Only `dist/` and `node_modules` exist. Nothing imports this package.

**Files:**
- Delete: `packages/chainlink-private-token-api-client/` (entire directory)

**Step 1: Delete the directory**

```bash
rm -rf packages/chainlink-private-token-api-client/
```

**Step 2: Verify no active imports**

```bash
grep -r "chainlink-private-token-api-client\|private-token-api-client" --include='*.ts' --include='*.tsx' --include='*.json' . | grep -v node_modules | grep -v .git | grep -v .worktrees | grep -v CLAUDE.md | grep -v README.md
```

Expected: 0 results.

**Step 3: Commit**

```bash
git add -A packages/chainlink-private-token-api-client/
git commit -m "chore: delete deprecated Private Token API client package"
```

---

### Task 9: Delete old Foundry contracts directory

All contracts ported to `contracts-fhe/` (Hardhat + fhEVM). The old `contracts/` directory uses Foundry and has old non-FHE versions.

**Files:**
- Delete: `contracts/` (entire directory — src/, script/, test/, lib/, out/, broadcast/, etc.)

**Step 1: Delete the directory**

```bash
rm -rf contracts/
```

**Step 2: Verify no active code references `contracts/` (not `contracts-fhe/`)**

```bash
grep -rn '"contracts/' --include='*.ts' --include='*.json' --include='*.sh' . | grep -v node_modules | grep -v .git | grep -v .worktrees | grep -v contracts-fhe | grep -v CLAUDE.md | grep -v README.md
```

Expected: Only hits in `scripts/deploy-subgraph.sh` (fixed in Task 14) and `scripts/generate-contract-types.sh` (deleted in Task 11).

**Step 3: Commit**

```bash
git add -A contracts/
git commit -m "chore: delete old Foundry contracts (replaced by contracts-fhe/)"
```

---

### Task 10: Delete prediction-market-frontend app

Demo frontend for the old CRE-based prediction market. Points to deprecated `insider-streams-2` subgraph. Not part of Zama architecture.

**Files:**
- Delete: `apps/prediction-market-frontend/` (entire directory)

**Step 1: Delete the directory**

```bash
rm -rf apps/prediction-market-frontend/
```

**Step 2: Commit**

```bash
git add -A apps/prediction-market-frontend/
git commit -m "chore: delete deprecated prediction-market-frontend (CRE demo)"
```

---

### Task 11: Delete deprecated scripts

These scripts depend on CRE, old Foundry contracts, or reference non-existent files. Note: `request-settlements.ts` is NOT deleted — it was fixed in Task 3 and integrated in Task 4.

**Files:**
- Delete: `scripts/cre-runner.ts` (CRE CLI helper, explicit deprecation notice)
- Delete: `scripts/batch-settle.ts` (manual CRE settlement alternative)
- Delete: `scripts/generate-contract-types.sh` (Foundry-based, explicit deprecation notice)
- Delete: `scripts/generate-supabase-types.sh` (Supabase type gen, explicit deprecation notice)
- Delete: `scripts/frontend-api-e2e.ts` (references non-existent `frontend-api.ts`)
- Delete: `scripts/deploy.sh` (CRE workflow deployment, needs full rewrite — not worth maintaining)

**Step 1: Delete the files**

```bash
rm scripts/cre-runner.ts
rm scripts/batch-settle.ts
rm scripts/generate-contract-types.sh
rm scripts/generate-supabase-types.sh
rm scripts/frontend-api-e2e.ts
rm scripts/deploy.sh
```

**Step 2: Commit**

```bash
git add scripts/cre-runner.ts scripts/batch-settle.ts scripts/generate-contract-types.sh scripts/generate-supabase-types.sh scripts/frontend-api-e2e.ts scripts/deploy.sh
git commit -m "chore: delete deprecated scripts (CRE, Foundry, Supabase, stale)"
```

---

### Task 12: Delete deprecated E2E test scripts

4 of 6 E2E tests call `runCRE()` to invoke workflows that no longer exist. The 2 surviving tests (`secret-marketplace-e2e.ts` and `e2e-helpers.ts`) don't use CRE.

**Files:**
- Delete: `scripts/e2e_tests/simple-market-e2e.ts` (CRE settlement workflow)
- Delete: `scripts/e2e_tests/secret-marketplace-auction-closer-e2e.ts` (CRE auction-closer)
- Delete: `scripts/e2e_tests/auction-cancelled-handler-e2e.ts` (CRE bid-refund)
- Delete: `scripts/e2e_tests/external-marketplace-settlement-resolved-handler-e2e.ts` (CRE reputation)

**Step 1: Delete the files**

```bash
rm scripts/e2e_tests/simple-market-e2e.ts
rm scripts/e2e_tests/secret-marketplace-auction-closer-e2e.ts
rm scripts/e2e_tests/auction-cancelled-handler-e2e.ts
rm scripts/e2e_tests/external-marketplace-settlement-resolved-handler-e2e.ts
```

**Step 2: Commit**

```bash
git add scripts/e2e_tests/
git commit -m "chore: delete CRE-dependent E2E test scripts"
```

---

## Phase C: Clean Up Packages and Config

---

### Task 13: Clean up packages/common

Remove Supabase types, dead `bidding.ts` (nothing imports `executeBid`), and Supabase dependency.

**Files:**
- Delete: `packages/common/src/__generated__/supabase-types.ts`
- Delete: `packages/common/src/bidding.ts` (imports Supabase, nothing uses it)
- Modify: `packages/common/src/index.ts:13,16` (remove Supabase export and bidding re-export)
- Modify: `packages/common/package.json:13` (remove `@supabase/supabase-js` dependency)

**Step 1: Delete the files**

```bash
rm packages/common/src/__generated__/supabase-types.ts
rm packages/common/src/bidding.ts
```

**Step 2: Update `packages/common/src/index.ts`**

Remove line 13 (`export type { Database } from "./__generated__/supabase-types";`) and line 16 (`export * from "./bidding";`).

The file should become:

```typescript
// Shared constants, utilities, and generated ABIs for private-streams
export {
  fheConfidentialUsdcAbi,
  fheSecretMarketplaceAbi,
  examplePredictionMarketAbi,
  mockUsdcAbi,
  // Backward-compatible aliases (old Foundry contract names -> new FHE contracts).
  // Consumers should migrate to fheConfidentialUsdcAbi / fheSecretMarketplaceAbi.
  fheConfidentialUsdcAbi as confidentialUsdcAbi,
  fheSecretMarketplaceAbi as secretMarketplaceAbi,
} from "./__generated__/contract-types";

export * from "./consts";
export * from "./create-auction";
export * from "./faucet";
export * from "./verify-signed-request";
```

**Step 3: Remove `@supabase/supabase-js` from `packages/common/package.json`**

Remove line 13: `"@supabase/supabase-js": "^2.98.0",`

**Step 4: Verify common still builds**

```bash
cd packages/common && pnpm build
```

Expected: Success (no Supabase references remain).

**Step 5: Commit**

```bash
git add packages/common/
git commit -m "chore: remove Supabase types, dead bidding.ts from common package"
```

---

### Task 14: Fix deploy-subgraph.sh

Two issues: (1) header comment says `insider-streams-2`, (2) ABI copy path uses `contracts/out` (Foundry) instead of `contracts-fhe/artifacts` (Hardhat).

**Files:**
- Modify: `scripts/deploy-subgraph.sh:2,17,184-200`

**Step 1: Fix the header comment**

Line 2: Change `insider-streams-2` to `insider-streams-zama`:

```bash
# deploy-subgraph.sh — Build and deploy the insider-streams-zama subgraph
```

**Step 2: Fix the artifacts directory**

Line 17: Change from:
```bash
ARTIFACTS_DIR="$ROOT_DIR/contracts/out"
```
To:
```bash
ARTIFACTS_DIR="$ROOT_DIR/contracts-fhe/artifacts/contracts"
```

**Step 3: Fix the ABI copy logic**

Lines 188-199: The Hardhat artifact structure is `artifacts/contracts/<ContractName>.sol/<ContractName>.json` (with `abi` key at top level, not nested). Update the loop:

```bash
  for contract in FHESecretMarketplace ExamplePredictionMarket; do
    # Map FHE contract name to subgraph ABI name
    case "$contract" in
      FHESecretMarketplace) abi_name="SecretMarketplace" ;;
      *) abi_name="$contract" ;;
    esac
    artifact="$ARTIFACTS_DIR/$contract.sol/$contract.json"
    if [ -f "$artifact" ]; then
      python3 -c "
import json, sys
artifact = json.load(open(sys.argv[1]))
json.dump(artifact['abi'], open(sys.argv[2], 'w'), indent=2)
" "$artifact" "$SUBGRAPH_DIR/abis/$abi_name.json"
      echo "  Copied $contract ABI -> subgraphs/secrets-marketplace/abis/$abi_name.json"
    else
      echo "  Skipping $contract ABI (Hardhat artifact not found at $artifact)"
    fi
  done
```

**Step 4: Commit**

```bash
git add scripts/deploy-subgraph.sh
git commit -m "fix: update deploy-subgraph.sh for Hardhat artifacts and zama subgraph"
```

---

### Task 15: Fix create-events.ts subgraph URL

The default subgraph URL points to the old `insider-streams-2` instead of `insider-streams-zama`.

**Files:**
- Modify: `scripts/create-events.ts:51-52`

**Step 1: Update the subgraph URL**

Change lines 51-52 from:
```typescript
const SUBGRAPH_URL = process.env.SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/1743303/insider-streams-2/version/latest";
```
To:
```typescript
const SUBGRAPH_URL = process.env.SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/1743303/insider-streams-zama/version/latest";
```

**Step 2: Commit**

```bash
git add scripts/create-events.ts
git commit -m "fix: update create-events.ts to use insider-streams-zama subgraph"
```

---

### Task 16: Clean up e2e-helpers.ts

Remove Supabase and CRE references. After deleting the 4 CRE E2E tests, only `secret-marketplace-e2e.ts` uses this file — and it doesn't use Supabase or CRE.

**Files:**
- Modify: `scripts/e2e_tests/e2e-helpers.ts:17-18` (remove Supabase imports)

**Step 1: Read the full file to understand all Supabase/CRE usage**

Read `scripts/e2e_tests/e2e-helpers.ts` fully.

**Step 2: Remove dead imports and Supabase-dependent exports**

- Remove line 17: `import type { Database } from "@private-streams/common";`
- Remove line 18: `import type { SupabaseClient } from "@supabase/supabase-js";`
- Remove any exported functions that reference `SupabaseClient` or `Database` types (these were only used by the now-deleted CRE E2E tests)
- Remove `runCRE` export if present (or it was in `cre-runner.ts` which is already deleted)

**Step 3: Verify the surviving E2E test still works**

```bash
cd scripts && pnpm build
```

Expected: TypeScript compilation passes.

**Step 4: Commit**

```bash
git add scripts/e2e_tests/e2e-helpers.ts
git commit -m "chore: remove Supabase/CRE imports from e2e-helpers.ts"
```

---

### Task 17: Clean up scripts/package.json

Remove dead script entries, Supabase dependency, and references to deleted files.

**Files:**
- Modify: `scripts/package.json`

**Step 1: Remove dead script entries**

Remove these from `"scripts"`:
- `"e2e:secret-marketplace-auction-closer"` (deleted test)
- `"e2e:external-prediction-market-settler"` (deleted test)
- `"e2e:external-marketplace-settlement-resolved-handler"` (deleted test)
- `"e2e:auction-cancelled-handler"` (deleted test)

Keep:
- `"build"`, `"e2e"`, `"e2e:secret-marketplace"`, `"codegen"`, `"create-events"`, `"spawn-auctions"`, `"request-settlements"`, `"place-bids"`, `"run-demo"`

**Step 2: Remove `@supabase/supabase-js` from dependencies**

Remove line 22: `"@supabase/supabase-js": "^2.98.0",`

Only remove this if the remaining scripts (`create-events.ts`, `spawn-auctions.ts`, `place-bids.ts`, `request-settlements.ts`, `e2e-helpers.ts`, `secret-marketplace-e2e.ts`) don't import Supabase. Verify first:

```bash
grep -r "supabase" scripts/create-events.ts scripts/spawn-auctions.ts scripts/place-bids.ts scripts/request-settlements.ts scripts/e2e_tests/secret-marketplace-e2e.ts scripts/e2e_tests/e2e-helpers.ts
```

If `e2e-helpers.ts` still has Supabase references after Task 16, keep the dependency. If clean, remove it.

**Step 3: Commit**

```bash
git add scripts/package.json
git commit -m "chore: remove dead scripts and stale deps from scripts/package.json"
```

---

### Task 18: Clean up root package.json

Remove script entries that reference deleted apps/scripts.

**Files:**
- Modify: `package.json` (root)

**Step 1: Remove dead script entries**

Remove these lines:
- Line 13: `"dev:prediction-market": "turbo run dev --filter=prediction-market-frontend",` (deleted app)
- Line 15: `"build:prediction-market": "turbo run build --filter=prediction-market-frontend",` (deleted app)
- Line 17: `"frontend-api": "pnpm --dir scripts run frontend-api",` (deleted script)
- Line 18: `"private-token-api": "pnpm --dir scripts run private-token-api",` (never existed)
- Line 19: `"watch": "pnpm --dir apps/event-watcher run start",` (deleted app)
- Line 20: `"build:contracts": "cd contracts && forge build --via-ir --skip SetupAll DeployPolicyEngine",` (deleted directory)
- Line 21: `"test:contracts": "cd contracts && forge test --via-ir --skip SetupAll DeployPolicyEngine",` (deleted directory)
- Line 22: `"generate:supabase-types": "./scripts/generate-supabase-types.sh"` (deleted script)

Keep:
- `"postinstall"`, `"build"`, `"dev"`, `"lint"`, `"codegen"`, `"codegen:insider-streams"`, `"wagmi"`, `"e2e"`, `"dev:insider-streams"`, `"build:insider-streams"`

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: remove dead script entries from root package.json"
```

---

### Task 19: Clean up insider-streams-frontend package.json

Remove unused `@supabase/supabase-js` dependency. Verified: zero Supabase imports in `apps/insider-streams-frontend/src/`.

**Files:**
- Modify: `apps/insider-streams-frontend/package.json:23`

**Step 1: Remove the dependency**

Remove line 23: `"@supabase/supabase-js": "^2.98.0",`

**Step 2: Verify frontend still builds**

```bash
cd apps/insider-streams-frontend && pnpm build
```

Expected: Success.

**Step 3: Commit**

```bash
git add apps/insider-streams-frontend/package.json
git commit -m "chore: remove unused @supabase/supabase-js from frontend"
```

---

### Task 20: Clean up turbo.json

Remove `SUPABASE_SERVICE_ROLE_KEY` from globalPassThroughEnv — no workspace packages use Supabase anymore.

**Files:**
- Modify: `turbo.json:37`

**Step 1: Remove the env var**

Remove line 37: `"SUPABASE_SERVICE_ROLE_KEY",`

**Step 2: Commit**

```bash
git add turbo.json
git commit -m "chore: remove SUPABASE_SERVICE_ROLE_KEY from turbo.json"
```

---

### Task 21: Delete Supabase migrations

These SQL files define the old Supabase schema (sellers, secrets, transfers, private_bids, balances). The daemon uses SQLite. No code references these migrations.

**Files:**
- Delete: `scripts/migrations/001_initial_schema.sql`
- Delete: `scripts/migrations/002_update_balances_and_bid_fk.sql`
- Delete: `scripts/migrations/` (directory)

**Step 1: Delete**

```bash
rm -rf scripts/migrations/
```

**Step 2: Commit**

```bash
git add scripts/migrations/
git commit -m "chore: delete deprecated Supabase migration files"
```

---

## Phase D: Build Verification and Documentation

---

### Task 22: Run pnpm install and verify build

After all deletions and dependency changes, the lockfile is stale.

**Step 1: Run pnpm install**

```bash
pnpm install
```

Expected: Success. No errors about missing packages.

**Step 2: Run full build**

```bash
turbo run build
```

Expected: All remaining packages build successfully:
- `@private-streams/common`
- `insider-streams-frontend`
- `@private-streams/scripts` (tsc --noEmit)

**Step 3: Commit the lockfile**

```bash
git add pnpm-lock.yaml
git commit -m "chore: update lockfile after deprecation cleanup"
```

---

### Task 23: Rewrite CLAUDE.md

The current CLAUDE.md (443 lines) extensively documents CRE workflows, Private Token API, event-watcher, Foundry contracts, and Supabase — all deprecated. Rewrite to reflect the Zama fhEVM + daemon architecture.

**Files:**
- Modify: `CLAUDE.md` (full rewrite)

**Step 1: Read current CLAUDE.md fully**

Read `CLAUDE.md` in its entirety to understand the structure.

**Step 2: Rewrite CLAUDE.md**

Key sections to update:

1. **Header**: Change from "CRE with Google Gemini AI, plus Compliant Private Token Transfers via Chainlink ACE" to "Zama fhEVM encrypted prediction marketplace with daemon-based automation"

2. **Project Structure tree**: Remove `prediction-market-frontend`, `event-watcher`, `chainlink-private-token-api-client`, `contracts/`, `cre-workflows/`. Add `contracts-fhe/`, `apps/daemon/`. Update `scripts/` tree (remove deleted files, add `place-bids.ts`).

3. **Package Management**: Remove "Bun for cre-workflows" line. Remove "cre-workflows/ and subgraphs/ are NOT in the pnpm workspace".

4. **Delete sections entirely**:
   - "Compliant Private Token API Client" section
   - "CRE Workflows" commands section
   - "Event Watcher" section
   - All CRE E2E test entries from the E2E Tests section
   - "Supabase" section (database URL, tables, views, migrations, type generation)
   - All Foundry-related "Contracts" commands (`pnpm build:contracts`, `pnpm test:contracts`)
   - All references to `insider-streams-2` subgraph
   - CRE CLI references and installation docs
   - All "Reference Docs" for CRE and Private Token API
   - Foundry deploy scripts table
   - Private token scripts table

5. **Add/update sections**:
   - "Daemon" section: document `apps/daemon/` (Express API + settler, auction-closer, reputation-resolver)
   - "Contracts" section: update for `contracts-fhe/` with Hardhat commands
   - "Demo Scripts" section: document `create-events`, `spawn-auctions`, `place-bids`, `request-settlements`, `run-demo`
   - Keep subgraph section but remove `insider-streams-2` reference
   - Keep "After a Contract Deployment" but remove Foundry references and update CRE workflow config table (deleted)
   - Remove `contracts/.env` from environment files table

6. **Keep unchanged**:
   - Telemetry section
   - Shared Package section (update exports list — remove Supabase)
   - Chain & Network section
   - Wallets section
   - GraphQL Codegen section
   - Firebase/Gemini services section

**Step 3: Verify no references to deleted items**

```bash
grep -n "cre-workflows\|event-watcher\|private-token-api\|contracts/\|prediction-market-frontend\|Supabase\|supabase\|insider-streams-2\|Foundry\|foundry\|forge build\|forge test" CLAUDE.md
```

Expected: 0 results (or only in historical context that's clearly marked).

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: rewrite CLAUDE.md for Zama fhEVM + daemon architecture"
```

---

### Task 24: Rewrite README.md

The current README.md (270 lines) is a hackathon submission document focused on CRE workflows, Private Token API, and Foundry contracts.

**Files:**
- Modify: `README.md` (full rewrite)

**Step 1: Read current README.md fully**

Read `README.md` in its entirety.

**Step 2: Rewrite README.md**

Replace the hackathon-oriented content with a concise project overview:

1. **Header + links**: Keep video link, update frontend link, remove prediction-market-frontend link
2. **Architecture**: Update description — Zama fhEVM encrypted marketplace, not CRE
3. **Remove entirely**:
   - "Chainlink prize-track coverage" section
   - CRE workflows table
   - "Chainlink Confidential Compute / Private Transactions" section
   - "Prediction Market integration" section
   - All references to old contract addresses
   - Old "Create a Prediction Market" tutorial section
   - "Close an Auction" CRE workflow tutorial
4. **Add**:
   - Brief overview of `contracts-fhe/` (4 contracts)
   - Brief overview of daemon services
   - Updated contract addresses table from `packages/common/src/consts.ts`
   - Quick start instructions
   - Demo scripts section (`run-demo` with sub-scripts)

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README.md for Zama fhEVM architecture"
```

---

### Task 25: Final verification

**Step 1: Check for stale references to deleted components**

```bash
grep -rn "cre-workflows\|cre-runner\|event-watcher\|private-token-api-client\|prediction-market-frontend\|user-balance-recording-fallback\|insider-streams-2\|generate-contract-types\|generate-supabase-types\|batch-settle\|frontend-api-e2e\|deploy\.sh" --include='*.ts' --include='*.tsx' --include='*.json' --include='*.sh' --include='*.yaml' . | grep -v node_modules | grep -v .git | grep -v .worktrees | grep -v docs/plans
```

Expected: 0 results.

**Step 2: Verify full build passes**

```bash
turbo run build
```

**Step 3: Verify no TypeScript errors in scripts**

```bash
cd scripts && pnpm build
```

**Step 4: Commit any fixes if needed, then do a final summary commit**

If everything is clean, no additional commit needed. Otherwise fix any remaining issues and commit.
