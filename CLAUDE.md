# Private Streams

AI-powered prediction market built on Chainlink Runtime Environment (CRE) with Google Gemini AI, plus Compliant Private Token Transfers via Chainlink ACE. All deployed on Ethereum Sepolia.

## Project Structure

```
private-streams/
├── apps/
│   ├── prediction-market-frontend/  # Next.js — settlement history UI (Firebase/Firestore)
│   └── insider-streams-frontend/    # Next.js — main app (scaffolded, not yet built)
├── packages/
│   ├── common/                          # Shared ABIs, addresses, utilities (@private-streams/common)
│   └── chainlink-private-token-api-client/  # Typed API client for Compliant Private Token API
├── contracts/                       # Foundry — MockUSDC + ExamplePredictionMarket + SecretMarketplace
├── cre-workflows/                   # CRE TypeScript workflows (Bun-managed)
│   ├── prediction-market-demo/      # Gemini AI settlement workflow
│   ├── auction-closer/             # Cron-based auction closer workflow
│   └── deposit-reconciler/         # Cron-based private token deposit/withdrawal reconciler
├── subgraphs/secrets-marketplace/   # The Graph subgraph
├── scripts/                         # E2E test scripts and utilities
│   ├── simple-market-e2e.ts         # ExamplePredictionMarket + CRE settlement E2E
│   ├── auction-closer-e2e.ts        # Auction closer CRE workflow E2E
│   ├── secret-marketplace-e2e.ts    # SecretMarketplace full event lifecycle E2E
│   ├── deposit-reconciler-e2e.ts    # Deposit reconciler workflow E2E
│   ├── generate-contract-types.sh   # Compile contracts + regenerate types/ABIs
│   ├── generate-supabase-types.sh   # Regenerate Supabase TypeScript types
│   ├── deploy-contracts.sh          # Interactive contract deploy + address replacement
│   ├── deploy-subgraph.sh           # Build + deploy subgraph (with optional address update)
│   ├── migrations/                  # Supabase SQL migrations
│   └── ...
└── CLAUDE.md
```

## Package Management

- **pnpm** workspace for `apps/*`, `packages/*`, `scripts`
- **Turborepo** for task orchestration and caching across pnpm workspace packages
- **Bun** for `cre-workflows/*` (CRE SDK requires Bun)
- `cre-workflows/` and `subgraphs/` are NOT in the pnpm workspace

## Key Commands

### Turborepo

```bash
turbo run build                                    # build all packages (cached)
turbo run build --filter=prediction-market-frontend # build one package
turbo run dev                                      # start all dev servers
turbo run lint                                     # lint all packages
turbo run codegen                                  # GraphQL codegen across packages
turbo run wagmi                                    # regenerate contract ABIs/types
```

### Contracts

```bash
pnpm build:contracts    # forge build --via-ir --skip SetupAll DeployPolicyEngine
pnpm test:contracts     # forge test --via-ir --skip SetupAll DeployPolicyEngine
```

### CRE Workflows

```bash
# From cre-workflows/ directory
cre workflow simulate prediction-market-demo --target local-simulation
cre workflow simulate prediction-market-demo --target local-simulation --broadcast

# Prediction Market (non-interactive, for scripts)
cre workflow simulate prediction-market-demo --target local-simulation \
  --evm-tx-hash <TX_HASH> --evm-event-index 0 --non-interactive --trigger-index 0

# Auction Closer (cron-triggered, non-interactive)
cre workflow simulate auction-closer --target local-simulation --non-interactive --trigger-index 0
cre workflow simulate auction-closer --target local-simulation --non-interactive --trigger-index 0 --broadcast

# Deposit Reconciler (cron-triggered, non-interactive)
cre workflow simulate deposit-reconciler --target local-simulation --non-interactive --trigger-index 0
```

### E2E Tests

All E2E scripts are TypeScript and run via `tsx` with `--env-file=.env` from the `scripts/` directory.

```bash
pnpm e2e                  # SecretMarketplace full event lifecycle
pnpm e2e:simple-market    # ExamplePredictionMarket + CRE settlement lifecycle
pnpm e2e:auction-closer   # Auction create → bid → expire → CRE close
pnpm e2e:deposits         # Deposit reconciler workflow
```

### Supabase

```bash
pnpm generate:supabase-types   # Regenerate types from live database (requires DATABASE_URL in root .env)
```

## Chain & Network

- **Chain**: Ethereum Sepolia (chain ID: 11155111)
- **RPC**: `https://ethereum-sepolia-rpc.publicnode.com`
- **Chain selector** (CRE): `ethereum-testnet-sepolia`
- **CRE Simulation Forwarder**: `0x15fc6ae953e024d975e77382eeec56a9101f9f88`

## Wallets

| Role   | Address                                      | Purpose                                                 |
| ------ | -------------------------------------------- | ------------------------------------------------------- |
| Owner  | `0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5` | Deploys contracts, creates events, requests settlement |
| Tester | `0x55D234274608a69a3E84c8Bc5Cd07F8A5f0f69Ce` | Makes predictions, claims winnings                      |

Private keys are in `.env` files (never committed).

## Supabase

- **Database URL**: Set `DATABASE_URL` in root `.env`
- **Tables**: `sellers`, `secrets`, `transfers`, `private_bids`
- **Views**: `balances` (computed from transfers + private_bids)
- **Type generation**: `pnpm generate:supabase-types` (outputs to `packages/common/src/__generated__/supabase-types.ts`)
- **Migrations**: `scripts/migrations/` (consolidated into `001_initial_schema.sql`)

## Subgraph (The Graph)

- **Subgraph name**: `insider-streams` (Subgraph Studio)
- **Studio URL** (codegen/testing): `https://api.studio.thegraph.com/query/1743303/insider-streams/version/latest`
- **Production URL**: `https://gateway.thegraph.com/api/subgraphs/id/GiEXREmvxbqNfQ3VxnhjKypYRNvEaeVjtAWncPHzPiuj`
- **Deploy**: `npx graph auth --studio <KEY>` then `./scripts/deploy-subgraph.sh` (prompts for contract address, auto-fetches start block)
- **Deploy with new address**: `./scripts/deploy-subgraph.sh --address 0x...` (non-interactive)
- Version tracked in `subgraphs/secrets-marketplace/package.json`; bumped automatically by `deploy-subgraph.sh` after successful deploy

## GraphQL Codegen

After a new subgraph is published, regenerate typed GraphQL clients:

```bash
turbo run codegen
```

After adding or updating GraphQL queries in a specific package, run the local codegen command from that directory:

```bash
pnpm run codegen   # from frontend, scripts, or CRE workflow directory
```

For the `cre-workflows/auction-closer/` package (outside pnpm workspace):

```bash
cd cre-workflows/auction-closer && bun run codegen
```

## After Major Contract Changes

After making substantial contract changes — especially to public-facing functions, events, or structs — you must regenerate types:

```bash
./scripts/generate-contract-types.sh
```

This script compiles contracts with Foundry, regenerates TypeScript types and ABIs via wagmi into `packages/common`, runs `pnpm install` to update workspace links, and copies extracted JSON ABIs to each frontend app's `src/abis/` directory. It does **not** deploy the subgraph — that is a separate step (see below).

Or just regenerate TypeScript types without recompiling: `pnpm wagmi`

## After a Contract Deployment

Use the interactive deploy script to deploy contracts and auto-replace addresses:

```bash
./scripts/deploy-contracts.sh
```

This script prompts which contracts to redeploy (MockUSDC, ExamplePredictionMarket, SecretMarketplace), deploys them via Foundry, then does a best-effort case-insensitive find-and-replace of the old addresses across the entire codebase (source files, configs, scripts, .env files). It also checks .env files for any stale addresses that may remain and warns about them.

After the script finishes, you must still:

### 1. Regenerate contract types

```bash
./scripts/generate-contract-types.sh
```

### 2. Verify hardcoded contract addresses

The deploy script replaces addresses automatically, but you should verify no stale addresses remain. Contract addresses are referenced in multiple locations.

**Critical locations:**

| File                           | What to update                                                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/common/src/index.ts` | `MOCK_USDC_ADDRESS`, `EXAMPLE_PREDICTION_MARKET_ADDRESS`, `SECRET_MARKETPLACE_ADDRESS`, `VAULT_ADDRESS` — **this is what frontends, scripts, and API client import** |
| `README.md`                    | Contract addresses table and any script examples referencing addresses                                                                                                                                    |

**E2E test scripts:**

| File                              | Variables with hardcoded defaults                 |
| --------------------------------- | ------------------------------------------------- |
| `scripts/simple-market-e2e.ts`    | `MOCK_USDC_ADDRESS`, `EXAMPLE_PREDICTION_MARKET_ADDRESS` |
| `scripts/auction-closer-e2e.ts`   | `MOCK_USDC_ADDRESS`, `SECRET_MARKETPLACE_ADDRESS` |

**CRE workflow configs:**

| File                                               | Fields                     |
| -------------------------------------------------- | -------------------------- |
| `cre-workflows/auction-closer/config.json`         | `secretMarketplaceAddress` |
| `cre-workflows/prediction-market-demo/config.json` | `simpleMarketAddress`      |
| `cre-workflows/deposit-reconciler/config.json`     | `tokenAddress`, `platformEoaAddress` |

After updating CRE workflow configs, the workflow must be redeployed and tested live.

**Foundry deploy scripts** (use env vars, not hardcoded — but verify `contracts/.env` is correct):

| File                                                   | Env vars used                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `contracts/script/DeployExamplePredictionMarket.s.sol`  | `MOCK_USDC_ADDRESS`, `CRE_FORWARDER_ADDRESS`                                    |
| `contracts/script/DeploySecretMarketplace.s.sol`       | `MOCK_USDC_ADDRESS`, `EXAMPLE_PREDICTION_MARKET_ADDRESS`, `CRE_FORWARDER_ADDRESS` |

**Private token scripts** (only if Vault or ConfidentialUSDC changed):

| File                                            | What's hardcoded                                     |
| ----------------------------------------------- | ---------------------------------------------------- |
| `contracts/script/private-transactions/*.s.sol` | `VAULT` constant (5 files)                           |
| `packages/common/src/index.ts`                  | `VAULT_ADDRESS` (used by API client's EIP712_DOMAIN) |

**Strategy for finding other uses:** Search the codebase for the old address with `grep -r "0xOLD_ADDRESS" --include='*.ts' --include='*.sh' --include='*.sol' --include='*.json' --include='*.yaml' --include='*.md' .` to catch any locations not listed above. Exclude `node_modules/`, `out/`, and `build/` directories. Note that `deploy-contracts.sh` handles most replacements automatically, but manual scanning is still necessary since grep may not catch everything (case sensitivity, partial matches, etc.).

### 3. Deploy the subgraph (if SecretMarketplace changed)

Ask the user if they want to deploy a new subgraph version. This is a separate step that should only be run **after** contract types have been regenerated (step 1).

```bash
./scripts/deploy-subgraph.sh                       # interactive — prompts for contract address
./scripts/deploy-subgraph.sh --address 0x...       # non-interactive — auto-fetches start block
./scripts/deploy-subgraph.sh --skip-deploy         # codegen + build only, no deploy
```

The deploy script copies ABIs from Foundry artifacts, runs `graph codegen` and `graph build`, then deploys to Subgraph Studio. After a successful deploy, it asks if you want to publish to The Graph Network — **publishing requires human interaction in a browser** (wallet signing on Arbitrum). The CLI opens the browser and returns immediately; the user must complete the publish flow in their browser.

After the script completes, tell the user: if the deploy succeeded, click the publish button in the browser when prompted. Once published, offer to regenerate GraphQL types.

### 4. Regenerate GraphQL types

After you receive confirmation from the user that the subgraph is published, regenerate typed GraphQL clients:

```bash
turbo run codegen
```

This updates the generated GraphQL types in the frontend, scripts, and CRE workflow packages against the published subgraph schema.

After running codegen, run `turbo run build` and report on any errors.

## Deployment Rules

**Do NOT redeploy contracts that haven't changed.** Redeploying requires updating addresses in multiple places and re-running E2E tests. Only redeploy the specific contract that changed.

Individual deploy scripts exist in `contracts/script/`:

- `DeployMockUSDC.s.sol` — rarely changes
- `DeployExamplePredictionMarket.s.sol` — env: `MOCK_USDC_ADDRESS`, `CRE_FORWARDER_ADDRESS`
- `DeploySecretMarketplace.s.sol` — env: `MOCK_USDC_ADDRESS`, `EXAMPLE_PREDICTION_MARKET_ADDRESS`, `CRE_FORWARDER_ADDRESS`
- `DeployAll.s.sol` — deploys everything (only for fresh environments)

After deploying, follow the full procedure in **"After a Contract Deployment"** above.

## Architecture Notes

- `ExamplePredictionMarket.sol` accepts **any ERC-20** token (constructor arg) — we use MockUSDC, not Circle USDC
- `newEvent(question, duration)` creates prediction events with a caller-specified duration (no hardcoded default)
- `forceSettle(eventId, outcome, confidenceBps, evidenceURI)` allows settling events without waiting for closure (debug/testing only; reverts if already settled)
- CRE workflow listens for `SettlementRequested` events, calls Gemini AI with Google Search grounding, submits signed report on-chain
- Settlement data is also written to Firestore for the frontend
- **Auction-closer CRE workflow** runs on a 30-second cron, reads `getOpenAuctions()` and `getAuction(id)` to find expired auctions, then submits a signed report with `ACTION_CLOSE_AUCTION` (0x00) to close them
- `closeAuction()` keeps funds in contract; admin withdraws via `withdrawFunds()`
- **Deposit-reconciler CRE workflow** runs on a 60-second cron, polls the Private Token API for transfers to/from the platform EOA, and records them as deposits or withdrawals in the Supabase `transfers` table
- CRE CLI installed at `~/.cre/bin/cre` (add to PATH: `export PATH="$HOME/.cre/bin:$PATH"`)

## Reference Docs

### CRE (Chainlink Runtime Environment)

- [CRE Overview](https://docs.chain.link/cre)
- [Part 1: Project Setup (TypeScript)](https://docs.chain.link/cre/getting-started/part-1-project-setup-ts)
- [Project Configuration Reference](https://docs.chain.link/cre/reference/project-configuration-ts)
- [Using Secrets in Simulation](https://docs.chain.link/cre/guides/workflow/secrets/using-secrets-simulation-go)
- [Using Secrets with Deployed Workflows](https://docs.chain.link/cre/guides/workflow/secrets/using-secrets-deployed)
- [Deploying Workflows](https://docs.chain.link/cre/guides/operations/deploying-workflows)
- [EVM Forwarder Directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts)
- [CRE CLI Installation](https://docs.chain.link/cre/getting-started/cli-installation/macos-linux)

### Chainlink confidential compute

- [Private transfers REST API docs] (note: this project should interact with this REST API with the client in packages/chainlink-private-token-api-client, but the client is based on the external API so the docs are the ultimate source of truth)

### Demos & Examples

- [CRE Prediction Market Demo](https://github.com/smartcontractkit/cre-gcp-prediction-market-demo)
- [CRE Bootcamp 2026](https://github.com/smartcontractkit/cre-bootcamp-2026)
- [Compliant Private Transfer Demo](https://github.com/smartcontractkit/Compliant-Private-Transfer-Demo)
- [Firebase Setup Guide](https://github.com/smartcontractkit/cre-gcp-prediction-market-demo/blob/main/firebase-setup.md)
