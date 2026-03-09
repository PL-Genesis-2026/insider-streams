# Insider Streams

AI-powered prediction market with a secret marketplace for auctioning insider information, built on [Chainlink Runtime Environment (CRE)](https://docs.chain.link/cre).

## Quick Start

```bash
pnpm install
pnpm build:contracts
pnpm dev:insider-streams
```

## Deployed Contracts (Eth Sepolia)

| Contract                | Address                                      |
| ----------------------- | -------------------------------------------- |
| ConfidentialUSDC        | `0xee3A0Cccb31fF816615C18E1d1DB480df8a0f9F1` |
| ExamplePredictionMarket | `0xc0800a96EbfEEd4F7C9113C6D9D960d2D912004f` |
| SecretMarketplace       | `0x1f903548234b15C4d955Cce79beaaC853A98C514` |

## Create a Prediction Market

### With CRE (automated settlement)

The [external-prediction-market-settler](cre-workflows/external-prediction-market-settler/) CRE workflow listens for `SettlementRequested` events, queries Gemini AI, and settles the market on-chain automatically.

```bash
# Install CRE CLI: https://docs.chain.link/cre/getting-started/cli-installation/macos-linux
# Then simulate the workflow:
cd cre-workflows
cre workflow simulate external-prediction-market-settler --target local-simulation --broadcast
```

See [CRE Workflows README](cre-workflows/README.md) for details.

### Manually (Foundry)

```bash
cd contracts

# Create a market
EXAMPLE_PREDICTION_MARKET_ADDRESS=0xc0800a96EbfEEd4F7C9113C6D9D960d2D912004f \
QUESTION="The New York Yankees won the 2009 World Series." \
forge script script/CreateMarket.s.sol --rpc-url $RPC_URL --broadcast
```

## Create an Auction on SecretMarketplace

```bash
cd contracts

SECRET_MARKETPLACE_ADDRESS=0x1f903548234b15C4d955Cce79beaaC853A98C514 \
EXTERNAL_MARKET_ID=0 \
RESERVE_PRICE=1000000 \
AUCTION_DURATION=120 \
forge script script/secret-marketplace/CreateAuction.s.sol --rpc-url $RPC_URL --broadcast
```

## Close an Auction

### Automatically (CRE workflow)

The [secret-marketplace-auction-closer](cre-workflows/secret-marketplace-auction-closer/) CRE workflow runs on a 30-second cron, detects expired auctions, and closes them via signed report.

```bash
cd cre-workflows
cre workflow simulate secret-marketplace-auction-closer --target local-simulation --broadcast
```

### Manually

```bash
cd contracts

SECRET_MARKETPLACE_ADDRESS=0x1f903548234b15C4d955Cce79beaaC853A98C514 \
AUCTION_ID=0 \
forge script script/secret-marketplace/CloseAuction.s.sol --rpc-url $RPC_URL --broadcast
```

### Cancel Auction (owner only)

Cancels an auction regardless of expiry. Refunds the highest bidder and records the prediction outcome.

```bash
cd contracts

SECRET_MARKETPLACE_ADDRESS=0x1f903548234b15C4d955Cce79beaaC853A98C514 \
AUCTION_ID=0 \
PREDICTION_OUTCOME=0 \
forge script script/secret-marketplace/CancelAuction.s.sol --rpc-url $RPC_URL --broadcast
```

`PREDICTION_OUTCOME`: 0=NoPrediction, 1=PredictionCorrect, 2=PredictionWrong. The `auction-cancelled-handler` CRE workflow handles bid refunds when auctions are cancelled.

## Local Testing Helpers

Four scripts populate the marketplace with test data. The easiest way to run them is the orchestrator:

### Demo orchestrator (`pnpm run-demo`) — recommended

Runs all three population scripts together:

1. **Seed** — runs `create-events` once at startup to create prediction market events
2. **Daemon** — starts `spawn-auctions` and `place-bids` as long-running background processes
3. **Refresh** — re-runs `create-events` every 30 minutes to add fresh events

```bash
cd scripts && pnpm run-demo
```

Prerequisites: frontend dev server running + all env vars set (see individual scripts below). Press Ctrl+C to stop all processes cleanly.

Optional env overrides:

- `CREATE_EVENTS_INTERVAL_MS` — how often to refresh events (default: `1800000` / 30 min)
- `INTERVAL_MS` — spawn-auctions / place-bids cycle interval (default: `300000` / 5 min)
- `BASE_URL` — frontend origin (default: `http://localhost:3000`)

---

### Create prediction market events (`pnpm create-events`)

One-shot script: fetches existing events from the subgraph (for deduplication), asks Venice AI to generate new prediction market questions, creates them on-chain, and places random bets from test accounts.

```bash
cd scripts && pnpm create-events
```

Required env vars in `scripts/.env`:

- `OWNER_PK` — creates events, mints CUSDC
- `TEST_ACCOUNT_1..25` — private keys for bet-placing accounts
- `RPC_URL` — Eth Sepolia RPC
- `VENICE_API_KEY` — Venice AI API key

### Spawn auctions (`pnpm spawn-auctions`)

Long-running daemon that creates one auction per cycle (default: every 5 minutes) against open prediction market events. Picks a random test account and a random canned secret payload each cycle. Skips events that are no longer open and tries the next candidate automatically.

```bash
cd scripts && pnpm spawn-auctions
```

Required env vars in `scripts/.env`:

- `TEST_ACCOUNT_1..25` — private keys for signing auction creation

Optional:

- `BASE_URL` — frontend origin (default: `http://localhost:3000`)
- `INTERVAL_MS` — cycle interval in ms (default: `300000` / 5 min)

The frontend dev server must be running (`turbo run dev --filter=insider-streams-frontend`) since auctions are created via the `/api/create-auction` API route.

### Place bids (`pnpm place-bids`) — debug only

Long-running daemon that places one bid per cycle on open auctions using rotating test accounts. Queries Supabase `private_bids` and `sellers` tables directly to find the current highest bidder and seller — data that is normally secret.

Auto-funds test accounts: if an account's available Supabase balance drops below 100 USDC, a synthetic deposit is inserted directly into the `transfers` table (no on-chain activity). Debug only.

```bash
cd scripts && pnpm place-bids
```

Required env vars in `scripts/.env`:

- `TEST_ACCOUNT_1..25` — private keys for signing bids
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (bypasses RLS)

Optional:

- `BASE_URL` — frontend origin (default: `http://localhost:3000`)
- `INTERVAL_MS` — cycle interval in ms (default: `300000` / 5 min)

## Regenerate Contract Types

After modifying contracts, regenerate TypeScript types, subgraph ABIs, and frontend ABIs:

```bash
./scripts/generate-contract-types.sh          # full pipeline including subgraph deploy
./scripts/generate-contract-types.sh --skip-deploy  # skip subgraph deploy
```

Or just regenerate TypeScript types:

```bash
pnpm wagmi
```

## E2E Tests

```bash
# SecretMarketplace full lifecycle (TypeScript)
pnpm e2e:secret-marketplace

# SimpleMarket + CRE settlement (bash)
./scripts/e2e_tests/simple-market-e2e.sh

# Auction-closer CRE workflow (bash)
./scripts/e2e_tests/secret-marketplace-auction-closer-e2e.sh
```

## Project Structure

```
private-streams/
├── apps/
│   ├── insider-streams-frontend/    # Next.js — main app
│   └── prediction-market-frontend/  # Next.js — settlement history UI
├── packages/common/                 # Shared ABIs, types, contract addresses
├── contracts/                       # Foundry — Solidity contracts
├── cre-workflows/                   # CRE TypeScript workflows
│   ├── external-prediction-market-settler/  # AI-powered market settlement
│   └── secret-marketplace-auction-closer/      # Automated auction closing
├── subgraphs/secrets-marketplace/   # The Graph subgraph
└── scripts/                         # E2E tests and utilities
```

.
