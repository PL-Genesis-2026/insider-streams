# Daemon API/Worker Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the daemon into API-only and workers-only modes via a `DAEMON_MODE` env var, with an internal HTTP endpoint for workers to update bid status in the API's SQLite database.

**Architecture:** Add `DAEMON_MODE` config (`api` | `workers` | `all`). In `workers` mode, the auction-closer and reputation-resolver call a new `POST /internal/mark-bids` endpoint on the API instead of writing to SQLite directly. A thin HTTP client module (`api-client.ts`) handles the remote call.

**Tech Stack:** Express, better-sqlite3, node:test, viem (existing)

**Important:** All work MUST be done in a git worktree to avoid interfering with e2e tests running on main.

---

### Task 1: Create git worktree

**Step 1: Create worktree branch**

```bash
cd /Users/adoll/projects/private-streams
git worktree add ../private-streams-api-split feat/daemon-mode-split
```

**Step 2: Verify worktree**

```bash
cd ../private-streams-api-split
git branch --show-current
```

Expected: `feat/daemon-mode-split`

**Step 3: Install dependencies**

```bash
cd /Users/adoll/projects/private-streams-api-split
pnpm install
```

All remaining tasks work in `/Users/adoll/projects/private-streams-api-split`.

---

### Task 2: Add DAEMON_MODE and internal API config

**Files:**
- Modify: `apps/daemon/src/config.ts`

**Step 1: Add config values**

Add these three fields to the `config` object in `apps/daemon/src/config.ts`:

```typescript
// Daemon mode: "api" (HTTP API only), "workers" (background services only), "all" (default)
daemonMode: (process.env.DAEMON_MODE || "all") as "api" | "workers" | "all",

// Internal API — used by workers to update bid status on the API's SQLite database.
// When the daemon runs split across multiple machines (DAEMON_MODE=api on one,
// DAEMON_MODE=workers on another), workers can't write to the API's SQLite directly.
// Instead they call POST /internal/mark-bids on the API, authenticated by this key.
// Both machines must share the same INTERNAL_API_KEY value.
internalApiKey: process.env.INTERNAL_API_KEY || "",
apiInternalUrl: process.env.API_INTERNAL_URL || "",
```

Add them after the `maxUploadBytes` line (before `} as const`).

**Step 2: Verify build**

Run: `cd apps/daemon && pnpm build`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/daemon/src/config.ts
git commit -m "Add DAEMON_MODE, INTERNAL_API_KEY, API_INTERNAL_URL config"
```

---

### Task 3: Add markBids abstraction

**Files:**
- Create: `apps/daemon/src/mark-bids.ts`

This module abstracts the choice between local SQLite and remote HTTP for marking bids. When `DAEMON_MODE=workers`, it calls the API's internal endpoint. Otherwise, it writes to SQLite directly.

**Step 1: Create the module**

Create `apps/daemon/src/mark-bids.ts`:

```typescript
/**
 * Bid status updates — abstraction over local SQLite vs remote API.
 *
 * When the daemon runs as a single process (DAEMON_MODE=all), bid status
 * updates go directly to SQLite via markBidsForAuction().
 *
 * When the daemon is split across machines (DAEMON_MODE=workers on the
 * workers box, DAEMON_MODE=api on the API box), the workers can't access
 * the API's SQLite file. Instead they call POST /internal/mark-bids on
 * the API, authenticated by a shared secret (INTERNAL_API_KEY).
 */

import { config } from "./config.js";
import { markBidsForAuction } from "./db.js";

/**
 * Mark all active bids for an auction with the given status.
 * Routes to local SQLite or remote API based on DAEMON_MODE.
 */
export async function markBids(
  auctionId: number,
  status: "won" | "cancelled",
): Promise<void> {
  if (config.daemonMode === "workers") {
    await markBidsRemote(auctionId, status);
  } else {
    markBidsForAuction(auctionId, status);
  }
}

/**
 * Call the API's internal endpoint to update bid status remotely.
 * Used when DAEMON_MODE=workers and SQLite lives on a different machine.
 */
async function markBidsRemote(
  auctionId: number,
  status: "won" | "cancelled",
): Promise<void> {
  const { apiInternalUrl, internalApiKey } = config;
  if (!apiInternalUrl || !internalApiKey) {
    throw new Error(
      "DAEMON_MODE=workers requires API_INTERNAL_URL and INTERNAL_API_KEY to be set",
    );
  }

  const url = `${apiInternalUrl}/internal/mark-bids`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": internalApiKey,
    },
    body: JSON.stringify({ auctionId, status }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`markBidsRemote failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as { ok: boolean; updated: number };
  console.log(`[mark-bids] Remote update: auction=${auctionId} status=${status} updated=${data.updated}`);
}
```

**Step 2: Verify build**

Run: `cd apps/daemon && pnpm build`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/daemon/src/mark-bids.ts
git commit -m "Add markBids abstraction for local/remote bid status updates"
```

---

### Task 4: Add POST /internal/mark-bids endpoint

**Files:**
- Modify: `apps/daemon/src/api.ts`
- Modify: `apps/daemon/src/db.ts` (need return value from markBidsForAuction)

**Step 1: Make markBidsForAuction return the update count**

In `apps/daemon/src/db.ts`, change `markBidsForAuction` (line 256) to return the number of rows updated:

```typescript
export function markBidsForAuction(auctionId: number, status: "won" | "refunded" | "cancelled"): number {
  const db = getDb();
  const result = db.prepare("UPDATE bids SET status = ? WHERE auction_id = ? AND status = 'active'").run(status, auctionId);
  return result.changes;
}
```

**Step 2: Add the internal endpoint to api.ts**

Add this block in `apps/daemon/src/api.ts` after the `/admin-expire` endpoint (before the `app.listen` call at line 943). The endpoint must be placed before the server starts listening:

```typescript
  // ---------------------------------------------------------------------------
  // POST /internal/mark-bids — internal, API-key authenticated
  //
  // Used by the workers daemon (DAEMON_MODE=workers) running on a separate
  // machine to update bid status in this API's SQLite database. When the
  // daemon is split across VPSes, the workers can't write to SQLite directly,
  // so they call this endpoint instead.
  //
  // Auth: X-Internal-Key header must match INTERNAL_API_KEY env var.
  // This is a simple shared secret — sufficient because:
  //   1. This endpoint is not user-facing (only called by our own workers)
  //   2. Both keys are managed by the same operator on machines we control
  //   3. Traffic goes over HTTPS (HAProxy terminates TLS)
  // ---------------------------------------------------------------------------
  app.post("/internal/mark-bids", jsonMiddleware, async (req: Request, res: Response) => {
    try {
      // Auth check
      const key = req.headers["x-internal-key"];
      if (!config.internalApiKey || key !== config.internalApiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { auctionId, status } = req.body as { auctionId: number; status: string };

      if (auctionId == null || typeof auctionId !== "number") {
        res.status(400).json({ error: "Missing or invalid auctionId" });
        return;
      }

      if (status !== "won" && status !== "cancelled") {
        res.status(400).json({ error: "Invalid status — must be 'won' or 'cancelled'" });
        return;
      }

      const updated = markBidsForAuction(auctionId, status);
      console.log(`[api] /internal/mark-bids: auction=${auctionId} status=${status} updated=${updated}`);
      res.json({ ok: true, updated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api] POST /internal/mark-bids error:", msg);
      res.status(500).json({ error: msg });
    }
  });
```

Also update the import from `./db.js` at the top of `api.ts` (line 22-33) to include `markBidsForAuction` if it's not already imported. Looking at the current imports, it's NOT imported in `api.ts`, so add it to the existing import:

```typescript
import {
  getOrCreateUser,
  getUserByAddress,
  recordBid,
  getActiveBid,
  getWonBid,
  updateBidTxHash,
  markBidFailed,
  markBidsForAuction,
  getBidsByUserId,
  insertSecret,
  insertSecretWithFilecoin,
  getSecretsByAuctionIds,
} from "./db.js";
```

**Step 3: Verify build**

Run: `cd apps/daemon && pnpm build`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/daemon/src/api.ts apps/daemon/src/db.ts
git commit -m "Add POST /internal/mark-bids endpoint for cross-machine bid status updates"
```

---

### Task 5: Write tests for the internal endpoint

**Files:**
- Modify: `apps/daemon/src/e2e-api.test.ts`

**Step 1: Add internal endpoint tests**

Add a new `describe` block at the end of the test file (before the closing of the file). The e2e tests spawn the API as a subprocess with env vars, so we set `INTERNAL_API_KEY` in the spawn env:

First, update the `before()` block that spawns the server to include `INTERNAL_API_KEY`:

In the `before()` at line 134, add `INTERNAL_API_KEY: "test-secret-key-12345"` to the `env` object:

```typescript
  serverProcess = spawn("npx", ["tsx", "src/api.ts"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: {
      ...process.env,
      API_PORT: String(API_PORT),
      DB_PATH: dbPath,
      PRIVATE_KEY: DAEMON_PK,
      INTERNAL_API_KEY: "test-secret-key-12345",
    },
    stdio: "pipe",
  });
```

Then add the test block at the end of the file:

```typescript
// ════════════════════════════════════════════════════════════════════════════
// Internal endpoint: /internal/mark-bids
// ════════════════════════════════════════════════════════════════════════════

describe("POST /internal/mark-bids", () => {
  const INTERNAL_KEY = "test-secret-key-12345";

  it("rejects request without API key", async () => {
    const { status } = await api("POST", "/internal/mark-bids", {
      auctionId: 1,
      status: "won",
    });
    assert.equal(status, 401);
  });

  it("rejects request with wrong API key", async () => {
    const resp = await fetch(`${BASE_URL}/internal/mark-bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": "wrong-key",
      },
      body: JSON.stringify({ auctionId: 1, status: "won" }),
    });
    assert.equal(resp.status, 401);
  });

  it("rejects invalid status", async () => {
    const resp = await fetch(`${BASE_URL}/internal/mark-bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_KEY,
      },
      body: JSON.stringify({ auctionId: 1, status: "invalid" }),
    });
    assert.equal(resp.status, 400);
  });

  it("rejects missing auctionId", async () => {
    const resp = await fetch(`${BASE_URL}/internal/mark-bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_KEY,
      },
      body: JSON.stringify({ status: "won" }),
    });
    assert.equal(resp.status, 400);
  });

  it("marks bids as won", async () => {
    // First create a user and bid via normal API
    const bidPayload = await signPayload(ALICE, { auctionId: "9000", amount: "5000000" });
    await api("POST", "/bid", bidPayload);

    // Mark the bid as won via internal endpoint
    const resp = await fetch(`${BASE_URL}/internal/mark-bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_KEY,
      },
      body: JSON.stringify({ auctionId: 9000, status: "won" }),
    });
    assert.equal(resp.status, 200);
    const data = (await resp.json()) as { ok: boolean; updated: number };
    assert.equal(data.ok, true);
    assert.equal(data.updated, 1);
  });

  it("marks bids as cancelled", async () => {
    const bidPayload = await signPayload(BOB, { auctionId: "9001", amount: "3000000" });
    await api("POST", "/bid", bidPayload);

    const resp = await fetch(`${BASE_URL}/internal/mark-bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_KEY,
      },
      body: JSON.stringify({ auctionId: 9001, status: "cancelled" }),
    });
    assert.equal(resp.status, 200);
    const data = (await resp.json()) as { ok: boolean; updated: number };
    assert.equal(data.ok, true);
    assert.equal(data.updated, 1);
  });

  it("returns updated=0 for auction with no active bids", async () => {
    const resp = await fetch(`${BASE_URL}/internal/mark-bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_KEY,
      },
      body: JSON.stringify({ auctionId: 99999, status: "won" }),
    });
    assert.equal(resp.status, 200);
    const data = (await resp.json()) as { ok: boolean; updated: number };
    assert.equal(data.ok, true);
    assert.equal(data.updated, 0);
  });
});
```

**Step 2: Run existing tests to verify nothing broke**

Run: `cd apps/daemon && pnpm test:e2e`
Expected: All existing tests pass, plus 7 new tests pass

**Step 3: Commit**

```bash
git add apps/daemon/src/e2e-api.test.ts
git commit -m "Add e2e tests for POST /internal/mark-bids endpoint"
```

---

### Task 6: Wire auction-closer to use markBids

**Files:**
- Modify: `apps/daemon/src/auction-closer.ts`

**Step 1: Replace direct SQLite calls with markBids**

In `apps/daemon/src/auction-closer.ts`:

1. Replace the import of `markBidsForAuction` from `./db.js` (line 20) with:
   ```typescript
   import { markBids } from "./mark-bids.js";
   ```

2. Replace `markBidsForAuction(Number(auctionId), "won")` at line 93 with:
   ```typescript
   await markBids(Number(auctionId), "won");
   ```

3. Replace `markBidsForAuction(Number(auctionId), "cancelled")` at line 153 with:
   ```typescript
   markBids(Number(auctionId), "cancelled").catch((err) => {
     console.error(`[closer] Failed to mark bids as cancelled for auction ${auctionId}:`, err);
   });
   ```
   Note: The cancellation handler is inside an `onLogs` callback that doesn't await, so we catch the promise.

**Step 2: Verify build**

Run: `cd apps/daemon && pnpm build`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/daemon/src/auction-closer.ts
git commit -m "Wire auction-closer to use markBids abstraction"
```

---

### Task 7: Wire reputation-resolver to use markBids

**Files:**
- Modify: `apps/daemon/src/reputation-resolver.ts`

**Step 1: Replace direct SQLite calls with markBids**

In `apps/daemon/src/reputation-resolver.ts`:

1. Replace the import of `markBidsForAuction` from `./db.js` (line 27) with:
   ```typescript
   import { markBids } from "./mark-bids.js";
   ```

2. Replace `markBidsForAuction(Number(auctionId), "won")` at line 253 with:
   ```typescript
   await markBids(Number(auctionId), "won");
   ```

**Step 2: Verify build**

Run: `cd apps/daemon && pnpm build`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/daemon/src/reputation-resolver.ts
git commit -m "Wire reputation-resolver to use markBids abstraction"
```

---

### Task 8: Add DAEMON_MODE to index.ts

**Files:**
- Modify: `apps/daemon/src/index.ts`

**Step 1: Add mode-based service startup**

Replace the entire `main()` function body in `apps/daemon/src/index.ts` with:

```typescript
async function main() {
  const mode = config.daemonMode;
  console.log("=== Private Streams Daemon ===");
  console.log(`Mode: ${mode}`);
  console.log(`RPC: ${config.rpcUrl}`);
  console.log(`Prediction Market: ${config.predictionMarketAddress}`);
  console.log(`Secret Marketplace: ${config.secretMarketplaceAddress}`);
  if (mode !== "workers") {
    console.log(`API Port: ${config.apiPort}`);
  }
  console.log("");

  const services: Promise<void>[] = [];

  // Start background workers (settler, closer, resolver) in "workers" or "all" mode
  if (mode === "workers" || mode === "all") {
    if (config.geminiApiKey) {
      services.push(startSettler());
    } else {
      console.log("[daemon] Settler disabled — missing GEMINI_API_KEY");
    }

    services.push(startAuctionCloser());
    services.push(startReputationResolver());
  }

  // Start HTTP API in "api" or "all" mode
  if (mode === "api" || mode === "all") {
    startApi();
  }

  if (services.length === 0 && mode !== "api") {
    console.warn("[daemon] No background services configured.");
  }

  if (services.length > 0) {
    const results = await Promise.allSettled(services);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      for (const f of failed) {
        console.error("[daemon] Service startup failed:", (f as PromiseRejectedResult).reason);
      }
    }
  }

  console.log(`\n[daemon] Started in ${mode} mode. Press Ctrl+C to stop.`);
}
```

**Step 2: Verify build**

Run: `cd apps/daemon && pnpm build`
Expected: No errors

**Step 3: Verify existing tests still pass**

Run: `cd apps/daemon && pnpm test:e2e`
Expected: All tests pass (API spawns `src/api.ts` directly, unaffected by index.ts changes)

Run: `cd apps/daemon && pnpm test:db`
Expected: All 11 tests pass

**Step 4: Commit**

```bash
git add apps/daemon/src/index.ts
git commit -m "Add DAEMON_MODE support to index.ts entry point"
```

---

### Task 9: Run full verification

**Step 1: Typecheck all packages**

Run: `turbo run build`
Expected: All packages build successfully

**Step 2: Lint**

Run: `turbo run lint`
Expected: No new lint errors

**Step 3: Run daemon unit tests**

Run: `cd apps/daemon && pnpm test:db`
Expected: All tests pass (markBidsForAuction now returns number, but all existing callers ignore return value)

**Step 4: Run daemon e2e tests**

Run: `cd apps/daemon && pnpm test:e2e`
Expected: All existing tests pass + 7 new internal endpoint tests pass

**Step 5: Commit any fixes if needed, then push**

```bash
git push -u origin feat/daemon-mode-split
```

---

### Task 10: Deploy workers to 178.156.244.121

**CRITICAL: The VPS at 178.156.244.121 has an existing nginx deployment. Do NOT modify, restart, or reconfigure nginx or any existing services.**

**Step 0: Recon — inspect what's running**

```bash
ssh bawler@178.156.244.121
# Check existing services
systemctl list-units --type=service --state=running
# Check nginx config
sudo nginx -T 2>/dev/null | head -50
# Check what ports are in use
sudo ss -tlnp
# Check disk space
df -h
# Check memory
free -h
```

Document findings before proceeding. Do NOT modify anything.

**Step 1: SSH and GitHub deploy key setup**

Copy the deploy key and SSH config from the daemon VPS (195.201.8.147). Same approach used for the scripts VPS (178.156.233.223) on 2026-03-14:

```bash
# On daemon VPS (195.201.8.147), copy the deploy key to the new VPS
scp ~/.ssh/id_ed25519_2 bawler@178.156.244.121:~/.ssh/id_ed25519_2
scp ~/.ssh/id_ed25519_2.pub bawler@178.156.244.121:~/.ssh/id_ed25519_2.pub

# On new VPS, set permissions and add SSH config
ssh bawler@178.156.244.121
chmod 600 ~/.ssh/id_ed25519_2
cat >> ~/.ssh/config << 'SSHEOF'
Host github-plgenesis
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_2
  IdentitiesOnly yes
SSHEOF
chmod 600 ~/.ssh/config

# Verify GitHub access
ssh -T github-plgenesis
```

Expected: `Hi plgenesis/private-streams! You've successfully authenticated`

**Step 2: Install Node.js and pnpm**

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc

# Install Node LTS (match scripts VPS)
nvm install --lts
node --version  # should be v24.x

# Install pnpm
npm install -g pnpm
pnpm --version  # should be 10.x
```

**Step 3: Clone repo and install**

```bash
cd ~
git clone github-plgenesis:plgenesis/private-streams.git private-streams-zama
cd private-streams-zama
git checkout feat/daemon-mode-split
pnpm install
```

**Step 4: Create .env file**

```bash
cat > apps/daemon/.env << 'ENVEOF'
DAEMON_MODE=workers
RPC_URL=<sepolia rpc url>
PRIVATE_KEY=<admin EOA private key>
GEMINI_API_KEY=<gemini api key>
API_INTERNAL_URL=https://api.insider-streams.com/api/zama
INTERNAL_API_KEY=<generate a random secret: openssl rand -hex 32>
NTFY_ENABLED=true
NTFY_HOST=https://api.insider-streams.com
NTFY_USER=daemon
NTFY_TOPIC_SETTLER=zama-settler
NTFY_TOPIC_AUCTION_CLOSER=zama-auction-closer
NTFY_TOPIC_REPUTATION_RESOLVER=zama-reputation-resolver
ENVEOF
```

Copy the actual secret values from the daemon VPS's `.env` file. Generate a fresh `INTERNAL_API_KEY` with `openssl rand -hex 32`.

**Step 5: Test workers startup**

```bash
cd ~/private-streams-zama/apps/daemon
npx tsx src/index.ts
```

Expected output:
```
=== Private Streams Daemon ===
Mode: workers
...
[closer] Watching ...
[resolver] Watching ...
[daemon] Started in workers mode. Press Ctrl+C to stop.
```

Verify NO `[api] Listening on port` message appears.

**Step 6: Create systemd service**

```bash
sudo tee /etc/systemd/system/ps-zama-workers.service << 'SVCEOF'
[Unit]
Description=Private Streams Zama Workers (settler, closer, resolver)
After=network.target

[Service]
Type=simple
User=bawler
WorkingDirectory=/home/bawler/private-streams-zama/apps/daemon
ExecStart=/home/bawler/.nvm/versions/node/v24.14.0/bin/npx tsx src/index.ts
Restart=always
RestartSec=10
Environment=HOME=/home/bawler
Environment=PATH=/home/bawler/.nvm/versions/node/v24.14.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
SVCEOF

sudo systemctl daemon-reload
sudo systemctl enable ps-zama-workers
sudo systemctl start ps-zama-workers
sudo systemctl status ps-zama-workers
```

Check logs: `journalctl -u ps-zama-workers -f`

---

### Task 11: Update API daemon on 195.201.8.147

**Step 1: Update code on daemon VPS**

```bash
ssh bawler@195.201.8.147
cd ~/private-streams-zama
git fetch origin
git checkout feat/daemon-mode-split
git pull
pnpm install
```

**Step 2: Add new env vars**

Add to `apps/daemon/.env`:
```
DAEMON_MODE=api
INTERNAL_API_KEY=<same secret as on workers VPS>
```

**Step 3: Restart daemon service**

```bash
sudo systemctl restart ps-zama-daemon
sudo systemctl status ps-zama-daemon
```

**Step 4: Verify health**

```bash
curl https://api.insider-streams.com/api/zama/health
```

Expected: `{"status":"ok","timestamp":"..."}`

**Step 5: Verify internal endpoint is reachable from workers VPS**

From 178.156.244.121:
```bash
curl -X POST -H "Content-Type: application/json" -H "X-Internal-Key: <the key>" \
  -d '{"auctionId":99999,"status":"won"}' \
  https://api.insider-streams.com/api/zama/internal/mark-bids
```

Expected: `{"ok":true,"updated":0}`

---

### Task 12: Verify end-to-end split

**Step 1: Check workers are processing events**

On 178.156.244.121:
```bash
journalctl -u ps-zama-workers --since "5 minutes ago"
```

Look for `[closer]`, `[settler]`, `[resolver]` log lines.

**Step 2: Check API is serving frontend**

Open the frontend in a browser, verify balance checks and bids work.

**Step 3: Verify no background services on API box**

On 195.201.8.147:
```bash
journalctl -u ps-zama-daemon --since "5 minutes ago"
```

Should only show `[api]` log lines, no `[closer]`, `[settler]`, or `[resolver]`.

**Step 4: Commit any deployment notes or config changes**

Update CLAUDE.md VPS table if needed to reflect the new 3-VPS layout.
