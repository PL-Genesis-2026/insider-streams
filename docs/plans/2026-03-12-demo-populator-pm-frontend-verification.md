# Demo Populator, PM Frontend Restoration, Contract Verification

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move demo data generation into the daemon as an opt-in service, restore the prediction market frontend with ABI fixes, and add Etherscan contract verification.

**Architecture:** Three independent changes. Contract verification modifies deploy scripts and runs manual verify commands. Demo populator adds a new daemon background service (`demo-populator.ts`) that replaces `run-demo.sh` by internalizing the logic from 4 standalone scripts. PM frontend is restored from `main` with ABI and subgraph fixes.

**Tech Stack:** Hardhat (hardhat-verify, hardhat-deploy), Node.js v25, viem v2.47, openai v6.27, graphql-request v7.4, zod v4.3, Next.js 16

---

## Batch 1: Contract Verification

### Task 1: Fix Etherscan API key loading in hardhat.config.ts

**Files:**
- Modify: `contracts-fhe/hardhat.config.ts:33-35`

**Step 1: Read the current etherscan config**

The config uses `vars.get("ETHERSCAN_API_KEY", "")` which reads from Hardhat's encrypted vars store, not from `.env`. Since `ETHERSCAN_API_KEY` is already in `contracts-fhe/.env` and we import `dotenv/config` at line 11, switch to `process.env`:

```typescript
etherscan: {
  apiKey: process.env.ETHERSCAN_API_KEY || "",
},
```

**Step 2: Verify compilation still works**

Run: `cd contracts-fhe && npx hardhat compile`
Expected: Compiled successfully

**Step 3: Commit**

```
fix: read ETHERSCAN_API_KEY from .env instead of hardhat vars
```

---

### Task 2: Add auto-verification to deploy scripts

**Files:**
- Modify: `contracts-fhe/deploy/001_deploy_MockUSDC.ts`
- Modify: `contracts-fhe/deploy/002_deploy_FHEConfidentialUSDC.ts`
- Modify: `contracts-fhe/deploy/003_deploy_ExamplePredictionMarket.ts`
- Modify: `contracts-fhe/deploy/004_deploy_FHESecretMarketplace.ts`

**Step 1: Add verification helper**

In each deploy script, after the `deploy()` call and log line, add verification for non-local networks. Each script's args differ:

**001_deploy_MockUSDC.ts** — no constructor args:
```typescript
if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
  try {
    await hre.run("verify:verify", {
      address: result.address,
      constructorArguments: [],
    });
  } catch (e: any) {
    if (e.message?.includes("Already Verified")) {
      console.log(`MockUSDC already verified`);
    } else {
      console.error(`MockUSDC verification failed:`, e.message);
    }
  }
}
```

**002_deploy_FHEConfidentialUSDC.ts** — args: `[deployer]`:
```typescript
constructorArguments: [deployer],
```

**003_deploy_ExamplePredictionMarket.ts** — args: `[mockUSDC.address, settlerAddress]`:
```typescript
constructorArguments: [mockUSDC.address, settlerAddress],
```

**004_deploy_FHESecretMarketplace.ts** — args: `[confidentialUSDCAddress, settlerAddress]`:
```typescript
constructorArguments: [confidentialUSDCAddress, settlerAddress],
```

**Step 2: Verify compilation**

Run: `cd contracts-fhe && npx hardhat compile`
Expected: Compiled successfully

**Step 3: Commit**

```
feat: add auto-verification to Hardhat deploy scripts
```

---

### Task 3: Retroactively verify deployed contracts

**Step 1: Verify MockUSDC (no constructor args)**

Run:
```bash
cd contracts-fhe && npx hardhat verify --network sepolia 0x1Cd05cf3c20Cd64f6803C1777C6373e47872944c
```
Expected: "Successfully verified" or "Already Verified"

**Step 2: Verify FHEConfidentialUSDC (1 arg: owner = deployer)**

Run:
```bash
npx hardhat verify --network sepolia 0x1f54Afd38756089cd2B8852e5014C6ccf1299b57 0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5
```
Expected: "Successfully verified" or "Already Verified"

**Step 3: Verify ExamplePredictionMarket (2 args: MockUSDC, settler)**

Run:
```bash
npx hardhat verify --network sepolia 0x7C22C1b9B2a4575089a996E98c877b996eBbBAA2 0x1Cd05cf3c20Cd64f6803C1777C6373e47872944c 0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5
```
Expected: "Successfully verified" or "Already Verified"

**Step 4: Verify FHESecretMarketplace (2 args: ConfidentialUSDC, settler)**

Run:
```bash
npx hardhat verify --network sepolia 0xf74884348F7153c63A46a1e362ec6D90E754Cf15 0x1f54Afd38756089cd2B8852e5014C6ccf1299b57 0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5
```
Expected: "Successfully verified" or "Already Verified"

**Step 5: No commit needed** — verification is an Etherscan-side action, no code changes.

---

## Batch 2: Demo Populator — Dependencies and Config

### Task 4: Add daemon dependencies for demo populator

**Files:**
- Modify: `apps/daemon/package.json`

**Step 1: Install new dependencies**

Run:
```bash
cd apps/daemon && pnpm add openai@^6.27.0 graphql-request@^7.4.0 graphql@^16.13.1 zod@^4.3.6
```

**Step 2: Verify build**

Run: `cd apps/daemon && pnpm build`
Expected: No errors

**Step 3: Commit**

```
chore: add openai, graphql-request, zod deps for demo populator
```

---

### Task 5: Add demo populator config

**Files:**
- Modify: `apps/daemon/src/config.ts`

**Step 1: Add demo-mode config entries**

After the existing `dbPath` line (~line 40), add:

```typescript
// Demo populator (opt-in)
demoMode: process.env.DEMO_MODE === "true",
veniceApiKey: process.env.VENICE_API_KEY || "",
subgraphUrl: process.env.SUBGRAPH_URL ||
  "https://api.studio.thegraph.com/query/1743303/insider-streams-zama/version/latest",
```

**Step 2: Verify build**

Run: `cd apps/daemon && pnpm build`
Expected: No errors

**Step 3: Commit**

```
feat: add demo populator config (DEMO_MODE, VENICE_API_KEY, SUBGRAPH_URL)
```

---

## Batch 3: Demo Populator — Core Implementation

### Task 6: Create demo-populator.ts

**Files:**
- Create: `apps/daemon/src/demo-populator.ts`

This is the largest task. The file implements four async cycle functions and a `startDemoPopulator()` entry point.

**Step 1: Write the file**

Create `apps/daemon/src/demo-populator.ts` with:

1. **Imports and constants**: viem, openai, graphql-request, zod, daemon internals (config, provider, marketplace, db, notify)

2. **Test account loading**: Read `TEST_ACCOUNT_1..25` from `process.env`, create viem accounts. Log count on startup.

3. **Subgraph client**: `new GraphQLClient(config.subgraphUrl)` singleton.

4. **Venice AI client**: `new OpenAI({ apiKey: config.veniceApiKey, baseURL: "https://api.venice.ai/api/v1" })`.

5. **`runCreateEvents()`**: Adapted from `scripts/create-events.ts`:
   - Query subgraph for existing events (inline gql, no codegen)
   - Ask Venice AI for 1-3 new questions (structured output with zod, fallback to json_object)
   - Create events on ExamplePredictionMarket via daemon's wallet client (`getWalletClient()`)
   - Place 3-5 random bets per event from test accounts (create temporary wallet clients per account — these are plain ERC-20 ops, no FHE, separate nonce sequences)
   - Use `sendNotification()` for ntfy

6. **`runSpawnAuctions()`**: Adapted from `scripts/spawn-auctions.ts`:
   - Query subgraph for open events (exclude settled)
   - Pick random test account, random secret, random duration
   - Call daemon internals directly:
     - `getOrCreateUser(address)` for the userId
     - Generate secretDataCid/secretDataKey from secretPayload (crypto.createHash + randomBytes)
     - Compute endTime from duration string (parse "5m"/"15m"/"30m"/"1h" to seconds)
     - Call `marketplace.createAuction(userId, eventId, question, endTime, prediction, secretDataCid, secretDataKey)`
     - `insertSecret(auctionId, userId, secretDataCid, secretDataKey)`
   - Use `sendNotification()` for ntfy

7. **`runPlaceBids()`**: Adapted from `scripts/place-bids.ts`:
   - Query subgraph for open auctions (endTime > now)
   - For each auction, pick random test account
   - Call daemon internals directly:
     - `getOrCreateUser(address)` for userId
     - `marketplace.getOnChainBalance(userId)` for balance check
     - If low balance: `marketplace.depositFor(userId, amount)` (skip faucet mint — daemon can call MockUSDC.mint directly since it's the owner)
     - `marketplace.placeBid(auctionId, userId, previousBidderId, amount)` where `previousBidderId` comes from `getActiveBidPreviousBidderId(auctionId)` in db.ts
   - Use `sendNotification()` for ntfy

8. **`runRequestSettlements()`**: Adapted from `scripts/request-settlements.ts`:
   - Query subgraph for closed-but-unsettled events
   - Call `requestSettlement(eventId)` on ExamplePredictionMarket via daemon's wallet client
   - Sequential to avoid nonce issues (same admin EOA)
   - Use `sendNotification()` for ntfy

9. **`startDemoPopulator()`**: Entry point called from index.ts:
   - Check `config.demoMode` — return early if false
   - Validate: `config.veniceApiKey` must be set, test accounts must exist
   - Log config summary (intervals, account count)
   - Run `runCreateEvents()` once immediately (seed)
   - Set intervals:
     - `runCreateEvents`: every 15 minutes (900_000 ms)
     - `runSpawnAuctions`: every 5 minutes (300_000 ms)
     - `runPlaceBids`: every 1 minute (60_000 ms)
     - `runRequestSettlements`: every 10 minutes (600_000 ms)
   - Each interval wraps its call in try/catch (log error, continue — same pattern as auction-closer.ts)

Key implementation details:
- All subgraph queries use inline `gql` template strings (same approach as spawn-auctions.ts, place-bids.ts, request-settlements.ts in scripts/)
- Venice AI model: `"openai-gpt-54"` (same as create-events.ts)
- Random helpers: `pickRandom()`, `randomInt()`, `shuffle()` — defined locally
- Test accounts create their own viem wallet clients for placing bets (not the daemon's singleton — different keys, different nonces)
- For `runPlaceBids`, when topping up balance, mint MockUSDC directly via `getWalletClient().writeContract({ address: MOCK_USDC_ADDRESS, abi: mockUsdcAbi, functionName: "mint", args: [account.address, amount] })` then call `marketplace.depositFor(userId, amount)`. This replaces the `/faucet` + `/deposit` HTTP calls.

**Step 2: Verify build**

Run: `cd apps/daemon && pnpm build`
Expected: No errors

**Step 3: Commit**

```
feat: add demo-populator daemon service
```

---

### Task 7: Wire demo-populator into daemon entry point

**Files:**
- Modify: `apps/daemon/src/index.ts`

**Step 1: Import and conditionally start the demo populator**

Add import:
```typescript
import { startDemoPopulator } from "./demo-populator.js";
```

In `main()`, after the existing service starts and before `await Promise.all(services)`, add:
```typescript
// Start demo populator if DEMO_MODE is enabled
if (config.demoMode) {
  services.push(startDemoPopulator());
} else {
  console.log("[daemon] Demo populator disabled — set DEMO_MODE=true to enable");
}
```

Also update the banner to show demo mode status.

**Step 2: Verify build**

Run: `cd apps/daemon && pnpm build`
Expected: No errors

**Step 3: Run existing tests to ensure no regressions**

Run: `cd apps/daemon && pnpm test:db && pnpm test:e2e`
Expected: 11/11 + 52/52 passing

**Step 4: Commit**

```
feat: wire demo-populator into daemon entry point
```

---

### Task 8: Delete run-demo.sh

**Files:**
- Delete: `scripts/run-demo.sh`
- Modify: `scripts/package.json` (remove `"run-demo"` script)
- Modify: `README.md` (update demo section)

**Step 1: Delete run-demo.sh**

Remove `scripts/run-demo.sh`.

**Step 2: Remove run-demo script from package.json**

In `scripts/package.json`, remove the line:
```json
"run-demo": "bash run-demo.sh"
```

**Step 3: Update README.md**

In the "Demo Scripts" section, replace the `run-demo` block with daemon demo mode instructions:

```markdown
## Demo Mode

The daemon includes a built-in demo populator that continuously generates events, auctions, bids, and settlements:

```bash
cd apps/daemon
DEMO_MODE=true pnpm start
```

Requires `VENICE_API_KEY` and `TEST_ACCOUNT_1..25` in `apps/daemon/.env`.

Intervals: create-events (15m), spawn-auctions (5m), place-bids (1m), request-settlements (10m).

Individual scripts remain available for one-shot runs:
```

Keep the individual script table that follows.

**Step 4: Commit**

```
chore: delete run-demo.sh, document daemon DEMO_MODE
```

---

## Batch 4: Restore Prediction Market Frontend

### Task 9: Restore PM frontend from main

**Files:**
- Restore: `apps/prediction-market-frontend/` (entire directory)

**Step 1: Restore from main branch**

Run:
```bash
git checkout main -- apps/prediction-market-frontend/
```

**Step 2: Install dependencies**

Run:
```bash
cd /Users/adoll/projects/private-streams && pnpm install
```

**Step 3: Verify files restored**

Run:
```bash
ls apps/prediction-market-frontend/src/components/buy-shares-panel.tsx
```
Expected: File exists

**Step 4: Commit**

```
feat: restore prediction-market-frontend from main
```

---

### Task 10: Fix ABI mismatch in buy-shares-panel.tsx

**Files:**
- Modify: `apps/prediction-market-frontend/src/components/buy-shares-panel.tsx`

**Step 1: Fix imports**

Change:
```typescript
import {
  examplePredictionMarketAbi,
  confidentialUsdcAbi,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  CONFIDENTIAL_USDC_DECIMALS,
} from "@private-streams/common";
```

To:
```typescript
import {
  examplePredictionMarketAbi,
  mockUsdcAbi,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
} from "@private-streams/common";
```

**Step 2: Replace all `confidentialUsdcAbi` usages with `mockUsdcAbi`**

There are 3 occurrences (lines ~117, ~126, ~132) where `abi: confidentialUsdcAbi` appears. Change each to `abi: mockUsdcAbi`.

**Step 3: Replace `CONFIDENTIAL_USDC_DECIMALS` with literal `6`**

There's 1 occurrence (~line 72): `parseUnits(trimmed, CONFIDENTIAL_USDC_DECIMALS)`. Change to `parseUnits(trimmed, 6)`. (Both MockUSDC and FHEConfidentialUSDC use 6 decimals — the value is the same but the semantic is now MockUSDC.)

**Step 4: Commit**

```
fix: use mockUsdcAbi instead of confidentialUsdcAbi in buy-shares-panel
```

---

### Task 11: Fix stale subgraph URL in codegen.ts

**Files:**
- Modify: `apps/prediction-market-frontend/codegen.ts`

**Step 1: Update the STUDIO_URL**

Change:
```typescript
const STUDIO_URL =
  "https://api.studio.thegraph.com/query/1743303/insider-streams-2/version/latest";
```

To:
```typescript
const STUDIO_URL =
  "https://api.studio.thegraph.com/query/1743303/insider-streams-zama/version/latest";
```

**Step 2: Commit**

```
fix: point PM frontend codegen to insider-streams-zama subgraph
```

---

### Task 12: Fix stale hardcoded address in admin-close-event route

**Files:**
- Modify: `apps/prediction-market-frontend/src/app/api/admin-close-event/route.ts`

**Step 1: Replace inline ABI and hardcoded address**

The file has a hardcoded `CONTRACT_ADDRESS = "0xc0800a96..."` and an inline ABI. Replace with imports from `@private-streams/common`:

Remove the inline `abi` array and `CONTRACT_ADDRESS` constant. Add import:
```typescript
import {
  examplePredictionMarketAbi,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
} from "@private-streams/common";
import type { Address } from "viem";
```

Replace `CONTRACT_ADDRESS` with `EXAMPLE_PREDICTION_MARKET_ADDRESS as Address` and `abi` with `examplePredictionMarketAbi` in the `readContract` and `writeContract` calls.

**Step 2: Commit**

```
fix: use common imports for admin-close-event route
```

---

### Task 13: Create .env.local and verify build

**Files:**
- Create: `apps/prediction-market-frontend/.env.local`

**Step 1: Create .env.local with required env var**

```
NEXT_PUBLIC_SUBGRAPH_URL=https://api.studio.thegraph.com/query/1743303/insider-streams-zama/version/latest
NEXT_PUBLIC_INSIDER_STREAMS_URL=http://localhost:3000
```

**Step 2: Verify .gitignore excludes .env.local**

Check that `apps/prediction-market-frontend/.gitignore` includes `.env.local`. (Next.js default gitignore does.)

**Step 3: Build PM frontend**

Run:
```bash
turbo run build --filter=prediction-market-frontend
```
Expected: Build succeeds

**Step 4: Build all packages to verify no regressions**

Run:
```bash
turbo run build
```
Expected: All packages build successfully

**Step 5: Commit (if any non-.env.local changes were needed)**

```
chore: verify PM frontend builds with insider-streams-zama subgraph
```

---

## Batch 5: Verification and Cleanup

### Task 14: Run all daemon tests

**Step 1: Run DB tests**

Run: `cd apps/daemon && pnpm test:db`
Expected: 11/11 passing

**Step 2: Run API E2E tests**

Run: `cd apps/daemon && pnpm test:e2e`
Expected: 52/52 passing

**Step 3: Run lifecycle test (Sepolia)**

Run: `cd apps/daemon && pnpm test:lifecycle`
Expected: 10/10 passing (~3 min)

---

### Task 15: Update MEMORY.md with correct addresses

**Files:**
- Modify: `/Users/adoll/.claude/projects/-Users-adoll-projects-private-streams/memory/MEMORY.md`

**Step 1: Update the Sepolia Deployed Addresses table**

Replace the old addresses with the current ones from `packages/common/src/consts.ts`:

| Contract | Address |
|---|---|
| MockUSDC | `0x1Cd05cf3c20Cd64f6803C1777C6373e47872944c` |
| FHEConfidentialUSDC | `0x1f54Afd38756089cd2B8852e5014C6ccf1299b57` |
| ExamplePredictionMarket | `0x7C22C1b9B2a4575089a996E98c877b996eBbBAA2` |
| FHESecretMarketplace | `0xf74884348F7153c63A46a1e362ec6D90E754Cf15` |

Also update the subgraph address to match.

---

### Task 16: Final commit and push

**Step 1: Commit all remaining changes**

```
feat: demo populator, PM frontend restoration, contract verification

- Add auto-verification to Hardhat deploy scripts
- Retroactively verify 4 deployed contracts on Etherscan
- Add daemon demo-populator service (DEMO_MODE=true)
- Delete run-demo.sh, keep individual scripts
- Restore prediction-market-frontend from main
- Fix ABI (confidentialUsdcAbi -> mockUsdcAbi)
- Fix codegen subgraph URL (insider-streams-2 -> insider-streams-zama)
- Fix admin-close-event stale hardcoded address
```

**Step 2: Push to remote**

Run: `git push origin feat/zama-testing`
