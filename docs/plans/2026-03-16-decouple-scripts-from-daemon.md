# Decouple Demo Scripts from Daemon API

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `spawn-auctions.ts` and `place-bids.ts` perform FHE encryption and on-chain transactions directly instead of proxying through the daemon HTTP API, so the Scripts VPS gets its own Zama relayer rate limit bucket.

**Architecture:** Move shared FHE helpers from `apps/daemon/src/fhe.ts` to `packages/common/src/fhe.ts` (parameterized by RPC URL). Scripts call FHESecretMarketplace directly via OWNER_PK. Lightweight internal API endpoints on the daemon keep SQLite in sync (users, bids, secrets) without touching the Zama relayer. `create-events.ts` and `request-settlements.ts` are already direct on-chain and need no changes.

**Tech Stack:** viem, @zama-fhe/relayer-sdk, @private-streams/common, Express internal API endpoints

---

### Task 1: Move FHE helpers to @private-streams/common

**Files:**
- Create: `packages/common/src/fhe.ts`
- Modify: `packages/common/src/index.ts`
- Modify: `packages/common/package.json`

**Step 1: Create `packages/common/src/fhe.ts`**

Copy from `apps/daemon/src/fhe.ts` but parameterize `getFhevmInstance` to accept `rpcUrl` instead of reading from daemon config:

```ts
/**
 * FHE Encrypted Input Helper
 *
 * Wraps @zama-fhe/relayer-sdk to create encrypted inputs for the
 * FHESecretMarketplace contract. The FhevmInstance is initialized
 * once (downloads TFHE public key from the relayer) and reused.
 *
 * All encryption uses the admin EOA as the "user address" because
 * only the admin submits transactions in the admin-proxy model.
 */

import {
  createInstance,
  SepoliaConfig,
  type FhevmInstance,
} from "@zama-fhe/relayer-sdk/node";

let _instance: FhevmInstance | null = null;
let _initPromise: Promise<FhevmInstance> | null = null;

/**
 * Get or create the singleton FhevmInstance.
 * First call downloads TFHE public key from the relayer (may take a few seconds).
 * @param rpcUrl - Ethereum RPC URL (e.g. Sepolia)
 */
export async function getFhevmInstance(rpcUrl: string): Promise<FhevmInstance> {
  if (_instance) return _instance;

  // Deduplicate concurrent init calls
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    console.log("[fhe] Initializing FhevmInstance (downloading public key from relayer)...");
    try {
      const instance = await createInstance({
        ...SepoliaConfig,
        network: rpcUrl,
      });
      console.log("[fhe] FhevmInstance ready.");
      _instance = instance;
      return instance;
    } finally {
      _initPromise = null;
    }
  })();

  return _initPromise;
}

export interface EncryptedInput {
  handles: Uint8Array[];
  inputProof: Uint8Array;
}

export async function encryptUint64(
  contractAddress: string,
  signerAddress: string,
  value: bigint,
  rpcUrl: string,
): Promise<EncryptedInput> {
  const instance = await getFhevmInstance(rpcUrl);
  const input = instance.createEncryptedInput(contractAddress, signerAddress);
  input.add64(value);
  return input.encrypt();
}

export async function encryptBool(
  contractAddress: string,
  signerAddress: string,
  value: boolean,
  rpcUrl: string,
): Promise<EncryptedInput> {
  const instance = await getFhevmInstance(rpcUrl);
  const input = instance.createEncryptedInput(contractAddress, signerAddress);
  input.addBool(value);
  return input.encrypt();
}

export async function encryptUint256(
  contractAddress: string,
  signerAddress: string,
  value: bigint,
  rpcUrl: string,
): Promise<EncryptedInput> {
  const instance = await getFhevmInstance(rpcUrl);
  const input = instance.createEncryptedInput(contractAddress, signerAddress);
  input.add256(value);
  return input.encrypt();
}

export async function encryptAuctionInputs(
  contractAddress: string,
  signerAddress: string,
  prediction: boolean,
  secretKey: bigint,
  rpcUrl: string,
): Promise<EncryptedInput> {
  const instance = await getFhevmInstance(rpcUrl);
  const input = instance.createEncryptedInput(contractAddress, signerAddress);
  input.addBool(prediction);
  input.add256(secretKey);
  return input.encrypt();
}
```

**Step 2: Add fhe exports to `packages/common/src/index.ts`**

Add at the end:
```ts
export * from "./fhe";
```

**Step 3: Add `@zama-fhe/relayer-sdk` to `packages/common/package.json`**

Add to `dependencies`:
```json
"@zama-fhe/relayer-sdk": "^0.4.2"
```

**Step 4: Verify common builds**

Run: `cd packages/common && pnpm build`
Expected: Clean compile

**Step 5: Commit**

```
feat(common): move FHE helpers to @private-streams/common

Parameterized getFhevmInstance(rpcUrl) so it can be used by both daemon
and scripts without daemon config dependency.
```

---

### Task 2: Update daemon to import FHE from common

**Files:**
- Delete: `apps/daemon/src/fhe.ts`
- Modify: `apps/daemon/src/marketplace.ts:15` — update import
- Modify: `apps/daemon/src/reputation-resolver.ts:26` — update import

**Step 1: Update `apps/daemon/src/marketplace.ts`**

Change line 15 from:
```ts
import { encryptUint64, encryptAuctionInputs, getFhevmInstance } from "./fhe.js";
```
to:
```ts
import { encryptUint64, encryptAuctionInputs, getFhevmInstance } from "@private-streams/common";
```

Then update all calls to `encryptUint64`, `encryptAuctionInputs`, and `getFhevmInstance` to pass `config.rpcUrl` as the last/only argument:

- `encryptUint64(contractAddr, signerAddr, amount)` → `encryptUint64(contractAddr, signerAddr, amount, config.rpcUrl)`
- `encryptAuctionInputs(contractAddr, signerAddr, prediction, secretKey)` → `encryptAuctionInputs(contractAddr, signerAddr, prediction, secretKey, config.rpcUrl)`
- `getFhevmInstance()` → `getFhevmInstance(config.rpcUrl)`

**Step 2: Update `apps/daemon/src/reputation-resolver.ts`**

Change line 26 from:
```ts
import { getFhevmInstance } from "./fhe.js";
```
to:
```ts
import { getFhevmInstance } from "@private-streams/common";
```

Update all calls to `getFhevmInstance()` → `getFhevmInstance(config.rpcUrl)`.

**Step 3: Delete `apps/daemon/src/fhe.ts`**

Remove the file entirely.

**Step 4: Verify daemon builds**

Run: `cd apps/daemon && pnpm build`
Expected: Clean compile

**Step 5: Run daemon tests**

Run: `cd apps/daemon && pnpm test:db`
Expected: 11 tests passing

Run: `cd apps/daemon && pnpm test:e2e`
Expected: 52 tests passing (if daemon is running locally; skip if not)

**Step 6: Commit**

```
refactor(daemon): import FHE helpers from @private-streams/common

Removed local fhe.ts in favor of shared package. All callers now pass
rpcUrl explicitly.
```

---

### Task 3: Add internal API endpoints to daemon

The scripts need to keep the daemon's SQLite in sync without going through the full user-facing API (which requires signature auth and does FHE operations). These internal endpoints are API-key authenticated (like existing `/internal/mark-bids`).

**Files:**
- Modify: `apps/daemon/src/api.ts`

**Step 1: Add `POST /internal/register-user` endpoint**

Add after the existing `/internal/mark-bids` handler (around line 989). Pattern matches the existing internal endpoint:

```ts
// ---------------------------------------------------------------------------
// POST /internal/register-user — internal, API-key authenticated
//
// Called by scripts running on a separate VPS to register/get a user's
// pseudonymous ID without going through signature auth. Keeps user
// records in sync so scripts can submit on-chain txs directly while
// the daemon tracks the user mapping.
// ---------------------------------------------------------------------------
app.post("/internal/register-user", jsonMiddleware, async (req: Request, res: Response) => {
  try {
    const key = req.headers["x-internal-key"];
    if (!config.internalApiKey || key !== config.internalApiKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { address } = req.body as { address: string };
    if (!address) {
      res.status(400).json({ error: "Missing address" });
      return;
    }

    const user = getOrCreateUser(address);
    res.json({ userId: user.userId, address: user.address, created: user.created });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api] POST /internal/register-user error:", msg);
    res.status(500).json({ error: msg });
  }
});
```

**Step 2: Add `POST /internal/record-bid` endpoint**

```ts
// ---------------------------------------------------------------------------
// POST /internal/record-bid — internal, API-key authenticated
//
// Called by scripts to record a bid in SQLite after submitting it
// on-chain directly. The daemon needs this record so the auction-closer
// and reputation-resolver can mark bids as won/cancelled.
// ---------------------------------------------------------------------------
app.post("/internal/record-bid", jsonMiddleware, async (req: Request, res: Response) => {
  try {
    const key = req.headers["x-internal-key"];
    if (!config.internalApiKey || key !== config.internalApiKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { auctionId, bidderId, amount, txHash } = req.body as {
      auctionId: number;
      bidderId: string;
      amount: string;
      txHash?: string;
    };

    if (auctionId == null || typeof auctionId !== "number") {
      res.status(400).json({ error: "Missing or invalid auctionId" });
      return;
    }
    if (!bidderId) {
      res.status(400).json({ error: "Missing bidderId" });
      return;
    }
    if (!amount) {
      res.status(400).json({ error: "Missing amount" });
      return;
    }

    const bid = recordBid(auctionId, bidderId, amount, txHash);
    console.log(`[api] /internal/record-bid: auction=${auctionId} bidder=${bidderId} amount=${amount} bidId=${bid.id}`);
    res.json({ ok: true, bidId: bid.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api] POST /internal/record-bid error:", msg);
    res.status(500).json({ error: msg });
  }
});
```

**Step 3: Add `POST /internal/insert-secret` endpoint**

```ts
// ---------------------------------------------------------------------------
// POST /internal/insert-secret — internal, API-key authenticated
//
// Called by scripts to store auction secret data in SQLite after
// creating an auction on-chain directly.
// ---------------------------------------------------------------------------
app.post("/internal/insert-secret", jsonMiddleware, async (req: Request, res: Response) => {
  try {
    const key = req.headers["x-internal-key"];
    if (!config.internalApiKey || key !== config.internalApiKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { auctionId, sellerId, secretDataCid, secretDataKey, secretData, eventData } = req.body as {
      auctionId: number;
      sellerId: string;
      secretDataCid: string;
      secretDataKey?: string;
      secretData?: string;
      eventData?: string;
    };

    if (auctionId == null || typeof auctionId !== "number") {
      res.status(400).json({ error: "Missing or invalid auctionId" });
      return;
    }
    if (!sellerId) {
      res.status(400).json({ error: "Missing sellerId" });
      return;
    }
    if (!secretDataCid) {
      res.status(400).json({ error: "Missing secretDataCid" });
      return;
    }

    insertSecret(auctionId, sellerId, secretDataCid, secretDataKey, secretData, eventData);
    console.log(`[api] /internal/insert-secret: auction=${auctionId} seller=${sellerId}`);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api] POST /internal/insert-secret error:", msg);
    res.status(500).json({ error: msg });
  }
});
```

**Step 4: Verify daemon builds**

Run: `cd apps/daemon && pnpm build`
Expected: Clean compile

**Step 5: Commit**

```
feat(daemon): add internal API endpoints for script DB sync

POST /internal/register-user, /internal/record-bid, /internal/insert-secret.
API-key authenticated, matching existing /internal/mark-bids pattern.
Scripts on separate VPS use these to keep daemon SQLite in sync after
submitting on-chain txs directly.
```

---

### Task 4: Add @zama-fhe/relayer-sdk to scripts dependencies

**Files:**
- Modify: `scripts/package.json`

**Step 1: Add dependency**

Add to `dependencies` in `scripts/package.json`:
```json
"@zama-fhe/relayer-sdk": "^0.4.2"
```

**Step 2: Install**

Run: `pnpm install` (from repo root)

**Step 3: Commit**

```
chore(scripts): add @zama-fhe/relayer-sdk dependency
```

---

### Task 5: Rewrite spawn-auctions.ts for direct on-chain

**Files:**
- Modify: `scripts/spawn-auctions.ts`

**Overview of changes:**
- Remove: `signedPost`, `signedFilePost`, `DAEMON_URL` usage, `submitAuction` (which POSTs to daemon)
- Add: Direct FHE encryption + contract calls via OWNER_PK
- Add: Internal API calls for DB sync (`/internal/register-user`, `/internal/insert-secret`)
- Keep: AI research, subgraph queries, ntfy, account selection logic (unchanged)

**Step 1: Rewrite the script**

The full rewrite replaces the daemon API call flow with:

1. Config: Add `RPC_URL`, `OWNER_PK`, `INTERNAL_API_KEY`, `DAEMON_URL` (now only used for internal API)
2. Add imports: `@private-streams/common` (fhe helpers, ABIs, addresses), `viem` (wallet/public client, contract interaction), `crypto` (SHA256, randomBytes)
3. New helper `internalPost(endpoint, body)` — calls daemon internal API with `X-Internal-Key` header
4. New helper `registerUser(address)` — calls `POST /internal/register-user`
5. New function `createAuctionOnChain(...)`:
   - Generate `secretDataCid` (SHA256 of payload) and `secretDataKey` (random 32 bytes)
   - Call `encryptAuctionInputs(contractAddr, signerAddr, prediction, secretKey, rpcUrl)` from common
   - Call `createAuction(...)` on FHESecretMarketplace via OWNER_PK wallet
   - Parse `AuctionCreated` event from receipt to get auctionId
   - Call `POST /internal/insert-secret` to record in daemon SQLite
6. Update `submitAuction` to use `createAuctionOnChain` instead of `signedPost`/`signedFilePost`

Key: The comment at the top of duplicated on-chain code should say:
```ts
// On-chain interaction duplicated from daemon to offload FHE operations
// to a separate VPS, avoiding Zama relayer rate limit contention.
```

**Step 2: Verify scripts build**

Run: `cd scripts && pnpm build`
Expected: Clean compile

**Step 3: Commit**

```
feat(scripts): spawn-auctions calls FHE + on-chain directly

No longer proxies through daemon /create-auction API. FHE encryption and
contract calls happen on the scripts VPS, giving it its own Zama relayer
rate limit bucket. Daemon SQLite kept in sync via /internal endpoints.
```

---

### Task 6: Rewrite place-bids.ts for direct on-chain

**Files:**
- Modify: `scripts/place-bids.ts`

**Overview of changes:**
- Remove: `signedPost` to `/user`, `/balance`, `/deposit`, `/bid`
- Add: Direct FHE encryption + contract calls via OWNER_PK
- Add: Balance reading via `getBalance(userId)` + `publicDecrypt()`
- Add: Internal API calls for DB sync (`/internal/register-user`, `/internal/record-bid`)
- Keep: Subgraph queries, ntfy, account selection, bid amount logic (unchanged)

**Step 1: Rewrite the script**

The full rewrite replaces the daemon API call flow with:

1. Config: Add `INTERNAL_API_KEY`, keep `OWNER_PK`, `RPC_URL`. `DAEMON_URL` now only for internal API.
2. Add imports: `@private-streams/common` (fhe helpers, ABIs, addresses), `viem` (contract interaction)
3. New helper `internalPost(endpoint, body)` — calls daemon internal API with `X-Internal-Key` header
4. New helper `registerUser(address)` — calls `POST /internal/register-user`, returns `{ userId }`
5. New function `getOnChainBalance(userId, rpcUrl)`:
   - Read encrypted balance handle from contract via `getBalance(userId)`
   - If zero hash, return 0n
   - Call `publicDecrypt([handle])` via FhevmInstance
   - Handle "not allowed for public decryption" → call `requestBalanceDecrypt` on-chain → retry
6. New function `depositForUser(userId, amount)`:
   - `encryptUint64(contractAddr, signerAddr, amount, rpcUrl)` from common
   - Call `depositFor(userId, encryptedHandle, inputProof)` on FHESecretMarketplace
7. New function `placeBidOnChain(auctionId, bidderId, previousBidderId, amount)`:
   - `encryptUint64(contractAddr, signerAddr, amount, rpcUrl)` from common
   - Call `placeBid(auctionId, bidderId, previousBidderId, encryptedHandle, inputProof, amount)` on FHESecretMarketplace
   - Call `POST /internal/record-bid` to record in daemon SQLite
8. Update `ensureBalance` to use `registerUser` + `getOnChainBalance` + `depositForUser`
9. Update main loop to use `placeBidOnChain` instead of `signedPost(account, "/bid", ...)`
10. Read auction from contract to get `previousBidderId` and check self-bid (same as daemon does)

Key: Same rate-limit comment as spawn-auctions.

**Step 2: Verify scripts build**

Run: `cd scripts && pnpm build`
Expected: Clean compile

**Step 3: Commit**

```
feat(scripts): place-bids calls FHE + on-chain directly

No longer proxies through daemon /bid, /balance, /deposit, /user APIs.
FHE encryption and contract calls happen on the scripts VPS, giving it
its own Zama relayer rate limit bucket. Daemon SQLite kept in sync via
/internal endpoints.
```

---

### Task 7: Full build verification and cleanup

**Files:**
- Verify: All packages build cleanly
- Remove: Any dead code (unused `signedPost` helpers, `DAEMON_URL` usage for user-facing endpoints)

**Step 1: Full turborepo build**

Run: `turbo run build`
Expected: All packages compile

**Step 2: Full lint**

Run: `turbo run lint`
Expected: No new lint errors

**Step 3: Daemon tests**

Run: `cd apps/daemon && pnpm test:db`
Expected: 11 tests passing

**Step 4: Verify scripts still reference DAEMON_URL only for internal API**

Grep for `DAEMON_URL` in scripts — should only appear in `internalPost` helper and config, not in `signedPost` or user-facing endpoint calls.

**Step 5: Commit any cleanup**

```
chore: cleanup dead code after script decoupling
```

---

### Task 8: Integration test against Sepolia

**Step 1: Test spawn-auctions**

Run: `cd scripts && pnpm spawn-auctions`

Expected:
- FhevmInstance initializes (downloads TFHE public key)
- FHE encryption completes (~10-30s)
- `createAuction` tx submitted and confirmed on Sepolia
- AuctionCreated event parsed, auctionId returned
- `/internal/register-user` and `/internal/insert-secret` succeed
- ntfy notification sent (if configured)

**Step 2: Test place-bids**

Run: `cd scripts && pnpm place-bids`

Expected:
- `/internal/register-user` succeeds
- Balance read + publicDecrypt works
- If low balance: mint + depositFor works
- FHE encryption of bid amount completes
- `placeBid` tx submitted and confirmed
- `/internal/record-bid` succeeds
- ntfy notification sent

**Step 3: Verify daemon DB has the records**

Check that the daemon's SQLite has the user, bid, and secret records created by the scripts.

**Step 4: Final commit if any fixes needed**

---

### Task 9: Update documentation

**Files:**
- Modify: `CLAUDE.md` — update scripts section to note they now call on-chain directly
- Modify: `scripts/spawn-auctions.ts` header comment
- Modify: `scripts/place-bids.ts` header comment

**Step 1: Update CLAUDE.md**

In the Demo Scripts section, update the descriptions to note:
- `spawn-auctions` and `place-bids` now perform FHE + on-chain directly (no daemon API dependency for on-chain ops)
- They still call daemon internal API for SQLite sync
- Add `INTERNAL_API_KEY` to the scripts env vars table

**Step 2: Commit**

```
docs: update CLAUDE.md for decoupled scripts
```
