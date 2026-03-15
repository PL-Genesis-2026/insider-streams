# Daemon API/Worker Split Design

## Problem

The daemon runs all services in a single process on a single VPS (195.201.8.147): HTTP API, settler, auction-closer, and reputation-resolver. The demo scripts run on a separate VPS (178.156.233.223) but still hit the same Zama relayer. All three sources of Zama traffic share one IP, causing rate limiting that degrades frontend responsiveness.

## Goal

Split the daemon so the frontend-facing API runs on a dedicated VPS with its own Zama relayer rate limit bucket, isolated from background workers and demo scripts.

## Architecture

```
Frontend (Vercel)
    |  HTTPS
    v
API-only daemon (195.201.8.147)
    port 3001, HAProxy/SSL, SQLite owner
    DAEMON_MODE=api
    |
    ^  HTTPS callback (POST /internal/mark-bids)
    |  X-Internal-Key auth
    |
Workers-only daemon (178.156.244.121)
    settler, auction-closer, reputation-resolver
    DAEMON_MODE=workers
    No SQLite — writes bid status via API callback
    Existing nginx on this box is NOT touched

Demo scripts cron (178.156.233.223) — unchanged
```

Each box has a distinct IP, giving each its own Zama relayer rate limit profile.

## Code Changes

All changes in a git worktree off main to avoid interfering with e2e tests.

### 1. DAEMON_MODE env var

Add `DAEMON_MODE` to `apps/daemon/src/config.ts`:
- `api` — start HTTP API only
- `workers` — start settler, auction-closer, reputation-resolver only
- `all` — current behavior (default, backward compatible)

Modify `apps/daemon/src/index.ts` to check `DAEMON_MODE` before starting each service group.

### 2. Internal endpoint: POST /internal/mark-bids

Add to `apps/daemon/src/api.ts`. This endpoint exists because the API and workers run on separate machines but share bid state — the auction-closer needs to mark bids as "won" or "cancelled" in the API's SQLite database after closing auctions on-chain.

**Auth:** `X-Internal-Key` header validated against `INTERNAL_API_KEY` env var. Simple shared secret. Comments in code must explain why this endpoint exists and why shared-secret auth is sufficient (internal-only, not user-facing, both keys managed by the same operator).

**Request:**
```json
POST /internal/mark-bids
X-Internal-Key: <shared secret>
Content-Type: application/json

{ "auctionId": 42, "status": "won" }
```

**Allowed statuses:** `won`, `cancelled` (the only statuses the workers write).

**Response:** `200 { ok: true, updated: <count> }` or `401/400/500`.

### 3. Worker HTTP callback client

New module `apps/daemon/src/api-client.ts`:
- `markBidsRemote(auctionId: number, status: string): Promise<void>`
- Calls `POST ${API_INTERNAL_URL}/internal/mark-bids` with the `X-Internal-Key` header
- Used by auction-closer and reputation-resolver when `DAEMON_MODE=workers`

### 4. Modify auction-closer.ts

Where it currently calls `markBidsForAuction(auctionId, "won")` and `markBidsForAuction(auctionId, "cancelled")`:
- If `DAEMON_MODE=workers`, call `markBidsRemote()` instead
- If `DAEMON_MODE=all` or `DAEMON_MODE=api`, call `markBidsForAuction()` directly (backward compatible)

A helper function (e.g. `markBids(auctionId, status)`) can abstract this choice.

### 5. Modify reputation-resolver.ts

Same pattern as auction-closer — swap direct SQLite call for HTTP callback when in workers mode.

### 6. New config values

Add to `apps/daemon/src/config.ts`:
```
DAEMON_MODE        — "api" | "workers" | "all" (default: "all")
INTERNAL_API_KEY   — shared secret for /internal/mark-bids (required when mode != "all")
API_INTERNAL_URL   — base URL of the API daemon (required when DAEMON_MODE=workers)
```

## SQLite Ownership

- **API box** (195.201.8.147) owns the SQLite database. All reads and writes go through it.
- **Workers box** (178.156.244.121) has no SQLite. It reads from chain and writes bid status via the internal HTTP endpoint.
- The workers box still needs `better-sqlite3` installed (it's a dependency of the daemon package) but won't open a database file.

## Deployment: 178.156.244.121 (Workers VPS)

### Phase 0: Recon

SSH in, inspect what's running. Check nginx config, ports, processes. **Do not modify anything existing.**

### Phase 1: SSH and GitHub setup

Copy from daemon VPS (195.201.8.147):
- Deploy key (`id_ed25519_2`)
- `github-plgenesis` SSH host alias in `~/.ssh/config`
- Same pattern as scripts VPS setup (2026-03-14)

### Phase 2: Runtime setup

- Install nvm, Node LTS, pnpm (match scripts VPS versions: Node v24.14.0, pnpm 10.32.1)
- Configure UFW (SSH only, or SSH + whatever nginx needs)
- Clone repo at `~/private-streams-zama` on the deployment branch
- `pnpm install` + rebuild native modules (`better-sqlite3`)

### Phase 3: Environment file

Create `apps/daemon/.env` with:
```
DAEMON_MODE=workers
RPC_URL=<sepolia rpc>
PRIVATE_KEY=<admin EOA>
GEMINI_API_KEY=<for settler>
API_INTERNAL_URL=https://api.insider-streams.com/api/zama
INTERNAL_API_KEY=<generated shared secret>
NTFY_ENABLED=true
NTFY_HOST=https://api.insider-streams.com
# ... other worker-relevant config
```

### Phase 4: Systemd service

Create `/etc/systemd/system/ps-zama-workers.service`:
- `ExecStart`: `npx tsx src/index.ts` from `apps/daemon/`
- Environment includes `DAEMON_MODE=workers`
- Different service name from `ps-zama-daemon` to avoid confusion if both are referenced

### Phase 5: Update API daemon (195.201.8.147)

Add to existing `apps/daemon/.env`:
```
DAEMON_MODE=api
INTERNAL_API_KEY=<same shared secret>
```

Restart `ps-zama-daemon` service.

## What Stays the Same

- HAProxy config on 195.201.8.147 — no changes
- Demo scripts on 178.156.233.223 — no changes
- Frontend Vercel config — no changes (still `api.insider-streams.com/api/zama`)
- nginx on 178.156.244.121 — completely untouched
- `deploy.sh` — will need updating in a follow-up (currently only deploys to 195.201.8.147)

## Testing

- Run existing daemon e2e tests (`pnpm test:e2e`) with `DAEMON_MODE=all` — must still pass (backward compat)
- Run daemon e2e tests with `DAEMON_MODE=api` — API endpoints work, no background services start
- Test `DAEMON_MODE=workers` — background services start, no API listens
- Test internal endpoint manually: `curl -X POST -H "X-Internal-Key: ..." -d '{"auctionId":1,"status":"won"}' .../internal/mark-bids`
- Verify workers can reach API internal endpoint from 178.156.244.121

## Risks

- **Zama rate limits may be per-wallet, not per-IP.** Splitting to a separate VPS definitively helps if per-IP. If per-wallet, it still helps API responsiveness (workers' slow `publicDecrypt` calls won't block API's `encryptUint64` calls).
- **Network dependency.** Workers now depend on the API being reachable for bid status updates. If the API is down, auctions still close on-chain but bid status won't update in SQLite until the API is back. This is acceptable — the on-chain state is the source of truth.
- **Shared admin nonce.** Both boxes submit transactions from the same admin EOA. Nonce conflicts are possible if both submit simultaneously. The existing `withAdminLock()` mutex only works within a single process. Mitigation: the API rarely writes transactions (only on user-initiated actions like `/bid`, `/deposit`, `/withdraw`), and the workers write transactions on event-driven schedules. Collisions are unlikely but possible. If this becomes an issue, a follow-up could add a distributed lock or split the admin wallet into two EOAs.
