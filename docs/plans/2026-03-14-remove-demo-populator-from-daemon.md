# Remove Demo Populator from Daemon — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove DEMO_MODE / demo-populator from the daemon process so content generation only runs via standalone scripts + OS cron. The daemon keeps only its upkeep services (settler, auction-closer, reputation-resolver, HTTP API).

**Architecture:** The standalone scripts in `scripts/` already exist and work correctly — they're the original implementation. The daemon's `demo-populator.ts` is a duplicate that was added later for convenience. We delete it from the daemon, remove all DEMO_MODE config, remove the daemon's demo ntfy topic configs (the scripts have their own ntfy), and update `scripts/.env` to have `ENABLE_NTFY=true` + `DAEMON_URL` + `NTFY_HOST`. The cron setup in `deploy.sh` already handles scheduling.

**Tech Stack:** TypeScript, Node.js tsx, pnpm, crontab, systemd

---

## Summary of Changes

| What | Action |
|------|--------|
| `apps/daemon/src/demo-populator.ts` | DELETE |
| `apps/daemon/src/index.ts` | Remove demo-populator import and startup |
| `apps/daemon/src/config.ts` | Remove `demoMode`, `veniceApiKey`, demo ntfy topic configs |
| `apps/daemon/.env` | Remove `DEMO_MODE`, `VENICE_API_KEY`, `TEST_ACCOUNT_*`, demo `NTFY_TOPIC_*` |
| `apps/daemon/package.json` | Remove `openai` and `zod` deps (only used by demo-populator) |
| `scripts/.env` | Add `ENABLE_NTFY=true`, `DAEMON_URL`, `NTFY_HOST` |
| `deploy.sh` | Remove `DEMO_MODE` mentions from env file check; update systemd description |
| `CLAUDE.md` | Update docs to reflect removal |
| Tests | Verify daemon starts cleanly, verify scripts run standalone |

---

### Task 1: Delete demo-populator from daemon

**Files:**
- Delete: `apps/daemon/src/demo-populator.ts`
- Modify: `apps/daemon/src/index.ts`

**Step 1: Remove import and startup of demo-populator from index.ts**

In `apps/daemon/src/index.ts`, remove:
```typescript
import { startDemoPopulator } from "./demo-populator.js";
```

And remove the block:
```typescript
  // Start demo populator if enabled
  if (config.demoMode) {
    services.push(startDemoPopulator());
  } else {
    console.log("[daemon] Demo populator disabled — set DEMO_MODE=true to enable");
  }
```

**Step 2: Delete demo-populator.ts**

```bash
rm apps/daemon/src/demo-populator.ts
```

**Step 3: Verify daemon typechecks**

```bash
cd apps/daemon && pnpm build
```
Expected: SUCCESS (no type errors)

**Step 4: Commit**

```bash
git add apps/daemon/src/index.ts
git rm apps/daemon/src/demo-populator.ts
git commit -m "Remove demo-populator from daemon — content generation moves to scripts + cron"
```

---

### Task 2: Clean up daemon config

**Files:**
- Modify: `apps/daemon/src/config.ts`
- Modify: `apps/daemon/.env`

**Step 1: Remove demo-related config from config.ts**

Remove these lines from `apps/daemon/src/config.ts`:
```typescript
  ntfyTopicCreateEvents: process.env.NTFY_TOPIC_CREATE_EVENTS || "zama-create-events",
  ntfyTopicSpawnAuctions: process.env.NTFY_TOPIC_SPAWN_AUCTIONS || "zama-spawn-auctions",
  ntfyTopicPlaceBids: process.env.NTFY_TOPIC_PLACE_BIDS || "zama-place-bids",
  ntfyTopicSettlements: process.env.NTFY_TOPIC_SETTLEMENTS || "zama-settlements",
```

Remove:
```typescript
  // Demo populator (opt-in)
  demoMode: process.env.DEMO_MODE === "true",
  veniceApiKey: process.env.VENICE_API_KEY || "",
```

**Step 2: Remove demo-related env vars from daemon .env**

Remove these lines from `apps/daemon/.env`:
- `NTFY_TOPIC_CREATE_EVENTS=zama-create-events`
- `NTFY_TOPIC_SPAWN_AUCTIONS=zama-spawn-auctions`
- `NTFY_TOPIC_PLACE_BIDS=zama-place-bids`
- `NTFY_TOPIC_SETTLEMENTS=zama-settlements`
- `VENICE_API_KEY=...`
- `TEST_ACCOUNT_1..25` (all 25 lines)
- `DEMO_MODE=false`
- The comment `# Subgraph (only used when DEMO_MODE=true)`
- The comment `# Set to true to generate auctions, events, bids, etc. Frequently triggers Zama rate limit`

Keep `SUBGRAPH_URL` and `SUBGRAPH_API_KEY` since the daemon may use them for other purposes (e.g. deposit watcher or future features).

**Step 3: Remove unused daemon dependencies**

Check if `openai` and `zod` are used elsewhere in daemon:
```bash
grep -r "from \"openai\"" apps/daemon/src/ --include='*.ts' | grep -v demo-populator
grep -r "from \"zod\"" apps/daemon/src/ --include='*.ts' | grep -v demo-populator
```

If not used elsewhere, remove from `apps/daemon/package.json`:
```bash
cd apps/daemon && pnpm remove openai zod
```

**Step 4: Verify daemon typechecks**

```bash
cd apps/daemon && pnpm build
```
Expected: SUCCESS

**Step 5: Commit**

```bash
git add apps/daemon/src/config.ts apps/daemon/.env apps/daemon/package.json
git commit -m "Remove demo config, env vars, and unused deps from daemon"
```

---

### Task 3: Verify standalone scripts work

**Files:**
- Modify: `scripts/.env`

**Step 1: Add missing env vars to scripts/.env**

Add to `scripts/.env`:
```
# Daemon API (used by spawn-auctions.ts, place-bids.ts)
DAEMON_URL=http://localhost:3001

# ntfy notifications
ENABLE_NTFY=true
NTFY_HOST=https://api.insider-streams.com
NTFY_USER=cron
```

**Step 2: Test create-events script (dry run)**

Start the daemon in one terminal:
```bash
cd apps/daemon && pnpm start
```

In another terminal, run:
```bash
cd scripts && pnpm create-events
```
Expected: Should connect to Venice AI, generate events, create them on-chain, place bets. Watch for errors.

**Step 3: Test spawn-auctions script**

```bash
cd scripts && pnpm spawn-auctions
```
Expected: Should query subgraph, find open events, POST to daemon `/create-auction`. If no daemon running, it will fail with connection error (expected).

**Step 4: Test place-bids script**

```bash
cd scripts && pnpm place-bids
```
Expected: Should query subgraph for open auctions, POST bids to daemon.

**Step 5: Test request-settlements script**

```bash
cd scripts && pnpm request-settlements
```
Expected: Should query subgraph for closed-unsettled events, call requestSettlement on-chain.

**Step 6: Commit .env changes**

Note: `.env` files are gitignored, so no commit needed. But verify the deploy script will set these up on the VPS (it already does via the cron wrapper scripts which use `--env-file=.env`).

---

### Task 4: Update deploy.sh

**Files:**
- Modify: `scripts/deploy.sh`

**Step 1: Update systemd service description**

In `deploy.sh`, the systemd unit description should no longer mention demo populator. Change:
```
Description=Private Streams Zama Daemon (settler, auction-closer, reputation-resolver, API)
```
This is already correct — no change needed.

**Step 2: Verify deploy.sh Phase 3 env check**

The Phase 3 env check already handles `scripts/.env` separately. Verify the warning message for daemon `.env` doesn't mention DEMO_MODE. Current text:
```
  echo "  Required keys: PRIVATE_KEY, RPC_URL, GEMINI_API_KEY"
```
This is already correct.

**Step 3: Verify cron setup in Phase 6 is correct**

The cron wrappers in Phase 6 already point to scripts, not the daemon. Verify the intervals match what we want:
- `create-events`: `*/15 * * * *` (every 15 min) — correct
- `spawn-auctions`: `*/10 * * * *` (every 10 min) — correct
- `place-bids`: `* * * * *` (every 1 min) — correct
- `request-settlements`: `* * * * *` (every 1 min) — correct

No changes needed to deploy.sh.

---

### Task 5: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update Daemon section**

In the Daemon description in CLAUDE.md, remove the reference to demo-populator. Update the daemon description to remove "demo-populator" from the list of background services.

Change the daemon bullet list from:
```
- **Settler**: watches `SettlementRequested` events, calls Gemini AI, submits settlement on-chain
- **Auction Closer**: polls for expired auctions, closes them, marks winning bids in SQLite
- **Reputation Resolver**: watches `SettlementResponse` events, resolves per-auction predictions
- **Deposit Watcher**: monitors on-chain deposits to the platform
- **HTTP API**: signature-authenticated POST endpoints...
```
(remove any demo-populator bullet)

Update the daemon commands to remove DEMO_MODE references:
```bash
cd apps/daemon
pnpm start                # run all services
pnpm api                  # run API only
pnpm closer               # run auction closer only
pnpm settler              # run settler only
pnpm resolver             # run reputation resolver only
```

**Step 2: Update Demo Scripts section**

Replace the DEMO_MODE explanation with a simpler cron-based explanation:
```markdown
### Demo Scripts

Scripts for populating the marketplace with test data. Run via OS cron on the VPS:

| Script | Cron | What |
|--------|------|------|
| `create-events` | `*/15 * * * *` | Generate AI events + place bets |
| `spawn-auctions` | `*/10 * * * *` | Create auction via daemon API |
| `place-bids` | `* * * * *` | Place bids on open auctions via daemon API |
| `request-settlements` | `* * * * *` | Request settlement for closed events |

Deployed via `scripts/deploy.sh` Phase 6 (cron wrappers + crontab entries).
```

**Step 3: Remove DEMO_MODE from env files table**

Remove the `DEMO_MODE` reference from the daemon .env description.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Update docs: remove DEMO_MODE, document cron-based demo scripts"
```

---

### Task 6: Verify daemon starts cleanly without demo-populator

**Step 1: Start daemon and verify startup logs**

```bash
cd apps/daemon && pnpm start
```

Expected output should include:
```
=== Private Streams Daemon ===
[daemon] All services started.
```

Should NOT include:
```
[daemon] Demo populator disabled — set DEMO_MODE=true to enable
```

**Step 2: Check daemon health endpoint**

```bash
curl http://localhost:3001/health
```
Expected: `{"status":"ok"}`

**Step 3: Run existing daemon tests**

```bash
cd apps/daemon && pnpm test:db
```
Expected: 11 tests passing

```bash
cd apps/daemon && pnpm test:e2e
```
Expected: 52 tests passing (requires daemon running)

---

## Post-Implementation: ntfy Topics

After this migration, the daemon only sends notifications to these topics (upkeep):
- `zama-settler` — event settlement outcomes
- `zama-auction-closer` — auction close notifications
- `zama-reputation-resolver` — reputation finalization

The scripts send to these topics (content generation, only when `ENABLE_NTFY=true` in `scripts/.env`):
- `zama-script-create-events` — event creation
- `zama-script-spawn-auctions` — auction spawning
- `zama-script-place-bids` — bid placement
- `zama-script-settlements` — settlement requests

**VPS ntfy topics you can stop listening to (from the daemon):**
- `zama-create-events` — no longer sent by daemon
- `zama-spawn-auctions` — no longer sent by daemon
- `zama-place-bids` — no longer sent by daemon
- `zama-settlements` — no longer sent by daemon

These are replaced by the `zama-script-*` variants from the standalone scripts (if `ENABLE_NTFY=true` is set in `scripts/.env`).
