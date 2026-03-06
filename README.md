# Insider Streams

AI-powered prediction market with a secret marketplace for auctioning insider information, built on [Chainlink Runtime Environment (CRE)](https://docs.chain.link/cre).

## Quick Start

```bash
pnpm install
pnpm build:contracts
pnpm dev:insider-streams
```

## Deployed Contracts (Eth Sepolia)

| Contract | Address |
|----------|---------|
| MockUSDC | `0xA75c910D441C99bA651a70451D3bE1d690c1DD85` |
| SimpleMarket | `0x89F02f5a5162570F1a79C5C505b6CA78D13229e7` |
| SecretMarketplace | `0x197D1150858Ce0c125B69E02D80790D7e7b017f1` |

## Create a Prediction Market

### With CRE (automated settlement)

The [prediction-market-demo](cre-workflows/prediction-market-demo/) CRE workflow listens for `SettlementRequested` events, queries Gemini AI, and settles the market on-chain automatically.

```bash
# Install CRE CLI: https://docs.chain.link/cre/getting-started/cli-installation/macos-linux
# Then simulate the workflow:
cd cre-workflows
cre workflow simulate prediction-market-demo --target local-simulation --broadcast
```

See [CRE Workflows README](cre-workflows/README.md) for details.

### Manually (Foundry)

```bash
cd contracts

# Create a market
SIMPLE_MARKET_ADDRESS=0x89F02f5a5162570F1a79C5C505b6CA78D13229e7 \
QUESTION="The New York Yankees won the 2009 World Series." \
forge script script/CreateMarket.s.sol --rpc-url $RPC_URL --broadcast
```

## Create an Auction on SecretMarketplace

```bash
cd contracts

SECRET_MARKETPLACE_ADDRESS=0x197D1150858Ce0c125B69E02D80790D7e7b017f1 \
EXTERNAL_MARKET_ID=0 \
RESERVE_PRICE=1000000 \
AUCTION_DURATION=120 \
forge script script/secret-marketplace/CreateAuction.s.sol --rpc-url $RPC_URL --broadcast
```

## Close an Auction

### Automatically (CRE workflow)

The [auction-closer](cre-workflows/auction-closer/) CRE workflow runs on a 30-second cron, detects expired auctions, and closes them via signed report.

```bash
cd cre-workflows
cre workflow simulate auction-closer --target local-simulation --broadcast
```

### Manually

```bash
cd contracts

SECRET_MARKETPLACE_ADDRESS=0x197D1150858Ce0c125B69E02D80790D7e7b017f1 \
AUCTION_ID=0 \
forge script script/secret-marketplace/CloseAuction.s.sol --rpc-url $RPC_URL --broadcast
```

### Force Close (owner only)

Force-closes an auction regardless of expiry. Refunds the highest bidder and adjusts seller reputation.

```bash
cd contracts

SECRET_MARKETPLACE_ADDRESS=0x197D1150858Ce0c125B69E02D80790D7e7b017f1 \
AUCTION_ID=0 \
REPUTATION_DELTA=-1 \
forge script script/secret-marketplace/ForceCloseAuction.s.sol --rpc-url $RPC_URL --broadcast
```

No automated CRE workflow exists for force-close yet — it requires new contract functions to determine when force-close is appropriate.

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
pnpm e2e

# SimpleMarket + CRE settlement (bash)
./scripts/simple-market-e2e.sh

# Auction-closer CRE workflow (bash)
./scripts/auction-closer-e2e.sh
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
│   ├── prediction-market-demo/      # AI-powered market settlement
│   └── auction-closer/              # Automated auction closing
├── subgraphs/secrets-marketplace/   # The Graph subgraph
└── scripts/                         # E2E tests and utilities
```
