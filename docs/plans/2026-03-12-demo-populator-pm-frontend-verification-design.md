# Design: Demo Populator, PM Frontend Restoration, Contract Verification

## Context

Three changes needed on `feat/zama-testing`:

1. **Contract verification** — contracts are deployed on Sepolia but not verified on Etherscan. Add auto-verification to deploy scripts and retroactively verify existing contracts.
2. **Demo populator** — move demo data generation (create-events, spawn-auctions, place-bids, request-settlements) from standalone scripts + `run-demo.sh` into the daemon as an opt-in background service.
3. **Restore prediction-market-frontend** — deleted during deprecation cleanup but is part of the product. Fix ABI mismatches and stale references.

## 1. Contract Verification

### Current State

- `@nomicfoundation/hardhat-verify` v2.1.3 installed and imported in `hardhat.config.ts`
- `etherscan.apiKey` configured via `vars.get("ETHERSCAN_API_KEY", "")`
- `ETHERSCAN_API_KEY` present in `contracts-fhe/.env`
- `hardhat-deploy` v0.11.45 provides `etherscan-verify` task that auto-verifies all contracts with deployment artifacts
- **No deploy script calls verification** — contracts deploy but are never verified

### Deployed Contracts (from consts.ts — source of truth)

| Contract | Address | Constructor Args |
|---|---|---|
| MockUSDC | `0x1Cd05cf3c20Cd64f6803C1777C6373e47872944c` | (none) |
| FHEConfidentialUSDC | `0x1f54Afd38756089cd2B8852e5014C6ccf1299b57` | `deployer` (owner) |
| ExamplePredictionMarket | `0x7C22C1b9B2a4575089a996E98c877b996eBbBAA2` | `MockUSDC address`, `deployer` (settler) |
| FHESecretMarketplace | `0xf74884348F7153c63A46a1e362ec6D90E754Cf15` | `FHEConfidentialUSDC address`, `deployer` (settler) |

Note: Only FHESecretMarketplace has a deployment artifact in `deployments/sepolia/`. The other 3 lack artifacts (deployed before hardhat-deploy was added).

### Changes

**Deploy scripts (4 files):** After each `deploy()` call, add verification:

```typescript
if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
  try {
    await hre.run("verify:verify", {
      address: result.address,
      constructorArguments: [...args],
    });
  } catch (e: any) {
    if (e.message.includes("Already Verified")) {
      console.log("Already verified");
    } else {
      console.error("Verification failed:", e.message);
    }
  }
}
```

**Retroactive verification:** Run `npx hardhat verify --network sepolia <address> [args]` for each of the 4 contracts. The deployer address is `0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5`.

**Note:** The `ETHERSCAN_API_KEY` is read via `vars.get()` (Hardhat vars), not `process.env`. Need to either set it via `npx hardhat vars set ETHERSCAN_API_KEY <key>` or switch to reading from `process.env` since the key is already in `.env`.

## 2. Demo Populator

### Current State

Four standalone scripts in `scripts/`:

| Script | Interval (run-demo.sh) | Dependencies | Talks to |
|---|---|---|---|
| `create-events.ts` | 30m (seed once at start) | openai, graphql-request, viem, zod, codegen SDK | On-chain direct (OWNER_PK) |
| `spawn-auctions.ts` | 5m | graphql-request, viem, @private-streams/common | Frontend `/api/create-auction` |
| `place-bids.ts` | 5m | graphql-request, viem, fast-json-stable-stringify | Daemon HTTP API |
| `request-settlements.ts` | 2m | graphql-request, viem, @private-streams/common | On-chain direct (OWNER_PK) |

`run-demo.sh` orchestrates them as background loops with `sleep` intervals.

### Design

**New file: `apps/daemon/src/demo-populator.ts`**

- Opt-in via `DEMO_MODE=true` env var
- Single `startDemoPopulator()` function called from `index.ts`
- Four `setInterval` loops matching the daemon's existing polling pattern (auction-closer.ts)
- Intervals: create-events 15m, spawn-auctions 5m, place-bids 1m, request-settlements 10m

**Approach: Copy logic, don't import scripts**

The scripts have top-level `await` statements, `process.exit()` calls, and create their own viem clients. Refactoring them to export clean `run()` functions would require changing their module initialization patterns. Instead:

- Copy the core logic from each script into `demo-populator.ts` as async functions
- Use the daemon's existing viem clients (`getPublicClient()`, `getWalletClient()`, `getAccount()`) instead of creating new ones
- Use the daemon's existing `sendNotification()` instead of per-script ntfy helpers
- For `spawn-auctions`: call the daemon's internal create-auction handler directly instead of hitting the frontend HTTP API
- For `place-bids`: call daemon internal functions directly instead of HTTP API with signatures
- For `create-events` and `request-settlements`: use daemon's wallet client (same OWNER_PK/PRIVATE_KEY)
- `create-events` needs Venice AI (openai SDK) and subgraph queries (graphql-request)

**New daemon dependencies:**

| Package | Version | Purpose |
|---|---|---|
| `openai` | `^6.27.0` | Venice AI for event question generation |
| `graphql-request` | `^7.4.0` | Subgraph queries |
| `graphql` | `^16.13.1` | Peer dep for graphql-request |
| `zod` | `^4.3.6` | Venice AI structured output validation |

**Config additions (`config.ts`):**

```typescript
demoMode: process.env.DEMO_MODE === "true",
veniceApiKey: process.env.VENICE_API_KEY || "",
subgraphUrl: process.env.SUBGRAPH_URL || "https://api.studio.thegraph.com/query/1743303/insider-streams-zama/version/latest",
```

Test accounts loaded from `TEST_ACCOUNT_1..25` env vars.

**Delete:** `scripts/run-demo.sh`

**Keep:** The 4 individual scripts in `scripts/` — they remain useful for one-shot manual runs.

### Key Design Decisions

1. **spawn-auctions calls daemon internals, not frontend API.** The script currently POSTs to `${BASE_URL}/api/create-auction` (frontend). Inside the daemon, we call the create-auction handler's core logic directly — the function that signs EIP-712, calls `marketplace.createAuction()`, records in SQLite. No HTTP roundtrip needed.

2. **place-bids calls daemon internals too.** The script currently POSTs to daemon `/bid`, `/faucet`, `/deposit`, `/balance` with signed requests. Inside the daemon, we call the underlying functions directly — `marketplace.placeBid()`, `marketplace.depositFor()`, `getOnChainBalance()`, etc.

3. **create-events uses its own wallet clients for test account bets.** The daemon's singleton wallet is the admin/owner key. But `create-events` also places bets FROM test accounts (each test account calls `buyShares` on ExamplePredictionMarket). These are standard ERC-20 operations (no FHE) so we create temporary viem wallet clients for each test account, same as the script does today. This doesn't conflict with the daemon's nonce management because each test account has its own nonce sequence.

4. **request-settlements uses daemon's wallet client.** It calls `requestSettlement()` from the owner EOA, same key the daemon already uses for all admin operations.

5. **Subgraph queries use inline `gql` templates** (like spawn-auctions.ts, place-bids.ts, request-settlements.ts). No codegen needed — `create-events.ts` uses codegen's `getSdk()` but the query is trivial (`ExistingEvents` — just `eventId` + `question`). We'll inline it.

## 3. Restore Prediction Market Frontend

### Current State

- Deleted from `feat/zama-testing` but exists on `main`
- 41 TS/TSX source files, Next.js 16.0.10, port 3100
- Direct-to-contract app — users connect wallets and trade on ExamplePredictionMarket with MockUSDC
- Only link to insider-streams-frontend: "Create auction" button in `buy-shares-panel.tsx` (opens insider-streams-frontend with eventId after placing a bet)

### Restoration: `git checkout main -- apps/prediction-market-frontend/`

### Required Fixes

**1. ABI mismatch in `buy-shares-panel.tsx`**

```
confidentialUsdcAbi → mockUsdcAbi
CONFIDENTIAL_USDC_DECIMALS → 6 (same value, but use literal or add MOCK_USDC_DECIMALS)
```

ExamplePredictionMarket uses plain MockUSDC (IERC20), not FHEConfidentialUSDC. The `confidentialUsdcAbi` happens to include `allowance`/`approve`/`balanceOf` for backward compatibility, but the correct ABI is `mockUsdcAbi`.

Also need to get the correct token address. The component calls `approve(EXAMPLE_PREDICTION_MARKET_ADDRESS, amount)` on the USDC contract. It currently doesn't import a USDC address — it reads `paymentToken()` from the PM contract on-chain. Need to check if this is already handled or needs fixing.

**2. Stale subgraph URL in `codegen.ts`**

```
insider-streams-2 → insider-streams-zama
```

The `insider-streams-zama` subgraph indexes both FHESecretMarketplace AND ExamplePredictionMarket, so the PM frontend's GraphQL queries (`eventCreateds`, `settlementResponses`, `sharesPurchaseds`, `sharesRedeemeds`) work with it.

**3. Stale hardcoded address in `admin-close-event/route.ts`**

```
0xc0800a96EbfEEd4F7C9113C6D9D960d2D912004f → EXAMPLE_PREDICTION_MARKET_ADDRESS from common
```

This route has an inline ABI for `adminCloseEvent` and `getEvent`. Replace with imports from `@private-streams/common`:
- `examplePredictionMarketAbi` for the ABI
- `EXAMPLE_PREDICTION_MARKET_ADDRESS` for the address

**4. `.env.local` setup**

The PM frontend needs `NEXT_PUBLIC_SUBGRAPH_URL` pointing to insider-streams-zama. Optionally `NEXT_PUBLIC_INSIDER_STREAMS_URL=http://localhost:3000` for the auction creation shortcut.

**5. Firebase references**

The frontend imports Firebase (`firebase` v12.4.0) for a settlements audit trail. This is low-priority — may still work or can be removed if the Firebase project is gone. Leave as-is for now.

**6. `@t3-oss/env-nextjs` validation**

`env.ts` requires `NEXT_PUBLIC_SUBGRAPH_URL`. Other env vars are optional. Need to create `.env.local` with the subgraph URL.

### What Does NOT Need Changing

- The PM frontend queries work with `insider-streams-zama` subgraph (same ExamplePredictionMarket entities)
- `pnpm-workspace.yaml` already includes `apps/*` — the frontend is automatically part of the workspace
- Wallet integration (Reown AppKit) works as-is — just needs `NEXT_PUBLIC_PROJECT_ID` in env (optional)
- Port 3100 doesn't conflict with insider-streams-frontend (3000) or daemon (3001)

## Verification Plan

### Contract Verification
- Run `npx hardhat verify` for each contract and confirm "Successfully verified" or "Already Verified"
- Check Etherscan pages show "Contract Source Code Verified"

### Demo Populator
- `cd apps/daemon && pnpm build` — typecheck passes
- Existing tests pass: `pnpm test:db` (11), `pnpm test:e2e` (52)
- Manual integration: start daemon with `DEMO_MODE=true VENICE_API_KEY=... TEST_ACCOUNT_1=...`, observe logs showing create-events/spawn-auctions/place-bids/request-settlements cycles running at correct intervals

### PM Frontend
- `turbo run build` — all packages build including PM frontend
- Manual smoke: `cd apps/prediction-market-frontend && pnpm dev` — verify events list loads from subgraph

## Pre-existing Issues (not in scope)

- **Address discrepancy:** README lists old addresses (`0xee3A0Ccc`, `0x0056F94e`), daemon `.env` has other stale addresses, but `consts.ts` and subgraph have the current addresses. CLAUDE.md subgraph section also references `0xf74884...` which matches consts.ts. The README and daemon .env are stale but this is a documentation issue, not a code issue.
- **MEMORY.md addresses are outdated** — should be updated to match consts.ts after this work.
