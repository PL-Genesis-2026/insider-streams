# Deposit Workflow - Deep Analysis

Reference doc for E2E testing, meant for Claude Code so it doesn't have to repeatedly o research on deposits. Updated as bugs are found/fixed or if you see an inconsistency when following it.

## Overview

The deposit flow moves USDC from a user's wallet into their marketplace bidding balance. It spans 4 systems: browser (FHE SDK), on-chain (FHEConfidentialUSDC), daemon (Express API), and on-chain again (FHESecretMarketplace).

## End-to-End Flow

```
User wallet (cUSDC)
  |
  | Step 0: Faucet (test only)
  |   POST /faucet -> daemon -> mintPlaintext(userAddr, 25e6) on-chain
  |   Mints 25 cUSDC to user's wallet address
  |
  | Step 1: FHE Encrypt (browser)
  |   fhevmInstance.createEncryptedInput(cUSDC_addr, user_addr)
  |   input.add64(amount)
  |   encrypted = await input.encrypt()
  |   -> Returns { handles: [Uint8Array], inputProof: Uint8Array }
  |   ~5-10s (ZK proof generation + relayer verification)
  |
  | Step 2: confidentialTransfer (on-chain tx from user wallet)
  |   FHEConfidentialUSDC.confidentialTransfer(PLATFORM_EOA, handle, proof)
  |   Transfers encrypted amount from user -> admin EOA
  |   ~15-30s (Sepolia block confirmation)
  |
  | Step 3: Notify daemon
  |   User signs payload: { amount: "1000000", timestamp }
  |   POST /api/funding/deposit -> Next.js proxy -> daemon POST /deposit
  |   Daemon responds immediately: { status: "pending" }
  |
  v
Daemon (async, after responding)
  |
  | Step 4: depositFor (on-chain tx from admin wallet)
  |   marketplace.depositFor(userId, amount)
  |     -> encryptUint64(marketplace_addr, admin_addr, amount) ~10s
  |     -> withAdminLock: writeContract("depositFor", [userId, handle, proof])
  |     -> waitForTransactionReceipt ~15-30s
  |   Contract: FHE.fromExternal -> confidentialTransferFrom(admin, contract, amount)
  |             -> _creditBalance(userId, actualTransferred)
  |
  v
Balance available for bidding (encrypted on-chain)
```

## Component-by-Component Details

### 1. Browser: FHE SDK Initialization

**File:** `src/lib/fhevm/use-fhevm.ts`

- Hook: `useFhevm()` returns `{ instance, status, error }`
- States: `idle` -> `loading` -> `ready` | `error`
- Triggers on `walletClient` change (wagmi)
- Singleton: `cachedInstance` at module level, survives re-renders

**SDK Load Chain** (`src/lib/fhevm/load-sdk.ts`):

1. Load CDN script: `https://cdn.zama.org/relayer-sdk-js/0.4.2/relayer-sdk-js.umd.cjs`
2. `initSDK()` - initializes WASM modules
3. `createInstance(SepoliaConfig + relayerUrl/v2 + provider)` - downloads TFHE public key

**Timing:** ~3-5s total (CDN load + WASM init + public key download)

**Known Issues:**

- `loadPromise` in load-sdk.ts is never cleared on failure - if CDN load fails, it stays rejected forever
- `initPromise` in load-sdk.ts is never cleared on failure - same permanent failure pattern
- `cachedInstance` in use-fhevm.ts means a successful init is never retried (good), but also means a failed init from a transient error requires page reload

### 2. Browser: Deposit Mutation

**File:** `src/lib/private-token/hooks.ts` - `useDeposit()`

```
mutationFn(amountHuman: string):
  1. Validate: address, walletClient, publicClient, fhevmInstance all must exist
  2. parseUnits(amountHuman, 6) -> bigint (6 decimals for USDC)
  3. FHE encrypt: fhevmInstance.createEncryptedInput(cUSDC_addr, user_addr)
     - input.add64(parsed)
     - encrypted = await input.encrypt()
  4. On-chain tx: walletClient.writeContract("confidentialTransfer", [PLATFORM_EOA, handle, proof])
  5. Wait: publicClient.waitForTransactionReceipt({ hash: txHash })
  6. Sign deposit notification: signMessageAsync({ message: stringify({ amount, timestamp }) })
  7. POST /api/funding/deposit with { amount, timestamp, signature }
  8. Invalidate funding-snapshot query cache
```

**Critical Guard:** Line 39-41: `if (!fhevmInstance) throw "FHE SDK not ready"`
This was causing failures when users clicked Deposit before SDK loaded.

### 3. UI: Wallet Action Center

**File:** `src/components/dashboard/wallet-action-center.tsx`

**State Management:**

- `amount` state (string) controlled by `<Input>` onChange
- `parsedAmount` = useMemo: `parseUnits(amount.trim(), 6)` - null if empty/invalid
- `fheSdkStatus` from `useFhevm()` hook

**Deposit Button Disabled When:**

```typescript
disabled={!parsedAmount || isDepositing || fheSdkStatus !== "ready"}
```

Three conditions:

1. `!parsedAmount` - no valid amount entered (amount state empty or unparseable)
2. `isDepositing` - mutation in progress
3. `fheSdkStatus !== "ready"` - FHE SDK not initialized

**Button Text:**

- `isDepositing` -> "Depositing..."
- `fheSdkStatus === "loading"` -> "Loading FHE..."
- else -> "Deposit"

**After Successful Deposit:**

- Sets successMessage: "Deposit complete! Your bidding balance will update shortly."
- Polls `fundingSnapshot.refresh()` every 10s for up to 80s (8 attempts)

**Input Element:**

```html
<input
  id="wallet-fund-amount"
  inputmode="decimal"
  placeholder="0.00"
  value="{amount}"
  onChange="{(e)"
  =""
/>
{ setAmount(e.target.value); setError(null); }} />
```

**IMPORTANT for E2E:** This is a React controlled input. Playwright's `fill()` dispatches
input/change events, but React 18+ uses a synthetic event system. The `fill()` method
should work because Playwright dispatches native `input` events which React's event
delegation captures, but there can be timing issues.

### 4. Next.js API Proxy

**Deposit route:** `src/app/api/funding/deposit/route.ts`

- Simple proxy: `proxyToDaemon("/deposit", body)`
- No error handling wrapper (unlike snapshot route)

**Snapshot route:** `src/app/api/funding/snapshot/route.ts`

- Proxies to daemon `/balance` endpoint
- Has try/catch with 502 fallback

**Daemon client:** `src/lib/daemon-client.ts`

- `DAEMON_URL = process.env.DAEMON_API_URL || "http://localhost:3001"`
- Simple fetch POST with JSON body

### 5. Daemon: POST /deposit

**File:** `apps/daemon/src/api.ts` (lines 382-427)

```
1. verifySignedRequest<{ amount, timestamp }>
2. Parse amount as BigInt, validate > 0
3. getOrCreateUser(userAddress) -> { userId, address }
4. Fire-and-forget: marketplace.depositFor(userId, parsedAmount)
5. Respond immediately: { userId, amount, status: "pending" }
```

**IMPORTANT:** The daemon does NOT wait for the on-chain depositFor tx.
It responds "pending" immediately. The frontend must poll `/balance` to see
when the deposit actually lands.

**IMPORTANT:** The daemon does NOT verify the user's confidentialTransfer tx.
It trusts that the user sent the cUSDC. The `amount` in the request body is
used directly - it's not read from the on-chain transfer event.

### 6. Daemon: marketplace.depositFor()

**File:** `apps/daemon/src/marketplace.ts` (lines 46-70)

```
1. encryptUint64(marketplace_addr, admin_addr, amount) -> ~10s
2. withAdminLock: writeContract("depositFor", [userId, handle, proof])
3. waitForTransactionReceipt
```

**Admin Lock:** Serializes all admin wallet txs. If another tx is in progress
(bid, close, settle), this waits. Single admin nonce = single concurrency.

### 7. Contract: depositFor()

**File:** `contracts-fhe/contracts/FHESecretMarketplace.sol` (lines 207-225)

```solidity
function depositFor(string userId, externalEuint64 encryptedAmount, bytes inputProof):
  1. FHE.fromExternal(encryptedAmount, inputProof) -> euint64
  2. balanceBefore = paymentToken.confidentialBalanceOf(this)
  3. FHE.allowTransient(amount, paymentToken)
  4. paymentToken.confidentialTransferFrom(admin, this, amount)
  5. balanceAfter = paymentToken.confidentialBalanceOf(this)
  6. actualTransferred = FHE.sub(balanceAfter, balanceBefore)
  7. _creditBalance(userId, actualTransferred)
```

### 8. Contract: \_creditBalance()

**File:** `contracts-fhe/contracts/FHESecretMarketplace.sol` (lines 543-551)

```solidity
function _creditBalance(string userId, euint64 amount):
  if existing balance:
    _balances[userId] = FHE.add(oldBalance, amount)  // NEW HANDLE
  else:
    _balances[userId] = amount
  FHE.allowThis(_balances[userId])  // Only allows contract, NOT public decrypt
```

**CRITICAL:** `FHE.add()` creates a NEW handle. The old handle is now stale.
`FHE.allowThis()` does NOT call `FHE.makePubliclyDecryptable()`.
After deposit, daemon must call `requestBalanceDecrypt(userId)` on-chain
before `publicDecrypt` works on the new handle.

### 9. Balance Reading After Deposit

**File:** `apps/daemon/src/marketplace.ts` (lines 213-298)

`getOnChainBalance(userId)`:

```
1. readContract("getBalance", [userId]) -> handle (euint64)
2. If handle == zeroHash -> return 0
3. Try publicDecrypt(handle) [fast path, ~7s]
   - If succeeds: return value
   - If "not allowed for public decryption": fall through
4. Submit requestBalanceDecrypt(userId) on-chain tx [slow path]
   - withAdminLock -> writeContract -> waitForReceipt
5. Retry publicDecrypt(handle)
6. Return value
```

**After deposit:** The handle changes (FHE.add creates new). The daemon's
try-first pattern hits the "not allowed" path and falls back to
requestBalanceDecrypt. This adds ~20-30s to the first balance check
after a deposit.

## Timing Summary

| Step                    | Duration    | Notes                                               |
| ----------------------- | ----------- | --------------------------------------------------- |
| FHE SDK init (browser)  | ~3-5s       | One-time per page load                              |
| FHE encrypt (browser)   | ~5-10s      | ZK proof generation                                 |
| confidentialTransfer tx | ~15-30s     | Sepolia block time                                  |
| Daemon responds         | <1s         | Immediate "pending"                                 |
| Daemon FHE encrypt      | ~10s        | Server-side ZK proof                                |
| Admin lock wait         | 0-60s       | If other admin tx in flight                         |
| depositFor tx           | ~15-30s     | Sepolia block time                                  |
| **Total deposit**       | **~50-90s** | User sees "Deposit complete" after step 3 (~25-45s) |
| Balance visible         | +20-60s     | After depositFor confirms + requestBalanceDecrypt   |

## E2E Test Considerations

### Wallet Unlock Flow

The deposit page (`/dashboard/wallet`) requires wallet unlock ("Sign and unlock" button)
before the Deposit tab is interactive. The unlock triggers:

1. `personal_sign` via mock wallet (instant in tests)
2. `useFundingSnapshot` query fires -> daemon `/balance` -> may take 7-60s

### Input Interaction

The amount input (`#wallet-fund-amount`) is a React controlled input:

```html
<input value="{amount}" onChange="{(e)" ="" /> setAmount(e.target.value)} />
```

For Playwright:

- `fill("1")` should work (dispatches native input event -> React captures)
- If `fill()` doesn't trigger React state, use `pressSequentially("1")` instead
- Or: `fill("")` then `type("1")` to simulate keystrokes
- Or: dispatch `InputEvent` manually via `page.evaluate()`

### Success Detection

After `handleDeposit()` succeeds (all 3 steps complete):

- `successMessage` state set to: `"Deposit complete! Your bidding balance will update shortly."`
- This renders inside an `<Alert>` with `<AlertDescription>` containing that text
- For E2E: `page.getByText(/deposit complete/i).waitFor({ timeout: 120_000 })`

### Error Detection

- `error` state renders in `<Alert variant="destructive">` with `<AlertDescription>`
- Errors from mutation: "FHE SDK not ready", "Connect your wallet", "Wallet client not available"
- For E2E: `page.locator('[role="alert"]').filter({ hasText: /fail|error/i })`

### Faucet (Pre-deposit)

The faucet button (`ConfidentialUsdcFaucetButton`) mints 25 cUSDC to the user's wallet.
For E2E tests, use the daemon API directly:

```typescript
signedDaemonRequest("/faucet", account) -> { txHash, amount: "25000000" }
```

### Global-Setup Admin Funding

`depositFor()` does `confidentialTransferFrom(admin, contract, amount)` — the admin EOA
must hold sufficient cUSDC. The global-setup (`e2e/global-setup.ts`) handles this by:

1. Checking admin's cUSDC `balanceOf` on-chain
2. If below what's needed for pending deposits, minting 10M cUSDC via `mintPlaintext`
   (onlyOwner, single tx — no faucet loop)
3. Only then calling `depositFunds()` for underfunded bidders

This avoids repeated faucet calls (25 cUSDC each) on every test run. After the initial
10M mint, the admin has enough cUSDC for ~100,000 deposits of 100 USDC each.

If a deposit fails with a timeout, the warning message directs you to check the admin's
cUSDC balance — this is the most common cause of deposit failures in E2E tests.

### Balance Verification

After deposit, verify via daemon API:

```typescript
signedDaemonRequest("/balance", account) -> { userId, balance: "1000000" }
```

Note: Balance may take 30-90s to update after deposit due to:

1. Daemon async depositFor tx (~30s)
2. New FHE handle needs requestBalanceDecrypt (~20s)

### Known Bugs and Fixes

#### Bug: FHE SDK permanent failure after rate limit

**Status:** FIXED in `apps/daemon/src/fhe.ts` (daemon only)

- `_initPromise` was never cleared on rejection
- Fixed with `try/finally` to always clear the promise in daemon's fhe.ts
- **Note:** The frontend's `load-sdk.ts` still has this issue — `loadPromise` and `initPromise` are never cleared on rejection. A failed init from a transient error requires page reload.

#### Bug: Deposit button stays disabled after FHE SDK ready

**Status:** RESOLVED - not a real bug

- `amountInput.fill("1")` DOES trigger React's controlled input onChange correctly
- The real issue was the FHE SDK failing to init (429 rate limit), not the input
- `pressSequentially()` works too and is slightly more reliable for React inputs

#### Bug: Concurrent useFhevm() inits cause RPC 429 rate limits

**Status:** FIXED in `src/lib/fhevm/use-fhevm.ts` - VERIFIED passing

- Two hook instances (wallet-action-center + useDeposit) both called `createInstance()` concurrently
- Each `createInstance()` makes RPC calls to the same public endpoint
- Duplicate calls triggered HTTP 429 rate limits, causing one init to fail
- Fix: added module-level `initPromise` to deduplicate concurrent `createInstance()` calls
- Same pattern used in daemon's `fhe.ts` and in `load-sdk.ts`
- After fix: SDK init consistently takes ~3s with no 429 errors

#### Bug: Admin lock contention from demo mode

**Status:** FIXED by setting `DEMO_MODE=false` in daemon .env

- Demo populator was competing for admin lock, blocking deposit txs

#### Bug: Balance handle staleness after deposit

**Status:** UNDERSTOOD (by design)

- `_creditBalance` creates new handle via `FHE.add()`
- New handle needs `requestBalanceDecrypt` before `publicDecrypt` works
- Daemon's try-first pattern handles this automatically but adds ~20-30s

## File Index

| File                                                | Role                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `src/lib/fhevm/load-sdk.ts`                         | CDN script loader + WASM init                                     |
| `src/lib/fhevm/use-fhevm.ts`                        | React hook for FhevmInstance singleton                            |
| `src/lib/fhevm/use-confidential-balance.ts`         | Read/decrypt wallet cUSDC balance (separate from bidding balance) |
| `src/lib/private-token/hooks.ts`                    | `useDeposit()` and `useWithdraw()` mutations                      |
| `src/lib/funding/api.ts`                            | `fetchFundingSnapshot()`, `requestFundingDeposit()`               |
| `src/lib/funding/queries.ts`                        | React Query wrapper for funding snapshot                          |
| `src/lib/funding/use-funding-snapshot.ts`           | Hook combining query + signed session                             |
| `src/lib/funding/get-funding-snapshot.ts`           | Status derivation logic                                           |
| `src/lib/funding/types.ts`                          | FundingStatus, FundingSnapshot types                              |
| `src/lib/daemon-client.ts`                          | `proxyToDaemon()` helper                                          |
| `src/app/api/funding/deposit/route.ts`              | Next.js proxy -> daemon /deposit                                  |
| `src/app/api/funding/snapshot/route.ts`             | Next.js proxy -> daemon /balance                                  |
| `src/components/dashboard/wallet-action-center.tsx` | Main UI component                                                 |
| `apps/daemon/src/api.ts`                            | Daemon HTTP API (POST /deposit, /balance, /faucet)                |
| `apps/daemon/src/marketplace.ts`                    | `depositFor()`, `getOnChainBalance()`                             |
| `apps/daemon/src/fhe.ts`                            | `encryptUint64()`, `getFhevmInstance()`                           |
| `apps/daemon/src/admin-lock.ts`                     | `withAdminLock()` serializer                                      |
| `contracts-fhe/.../FHESecretMarketplace.sol`        | `depositFor()`, `_creditBalance()`, `requestBalanceDecrypt()`     |
| `contracts-fhe/.../FHEConfidentialUSDC.sol`         | ERC-7984 token, `mintPlaintext()`, `confidentialTransfer()`       |
