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
| ConfidentialUSDC | `0x40d56cd551dB2c1e3867Af3232D3a1dcc04594B9` |
| ExamplePredictionMarket | `0x73b9beC7D6924D90Fc9F1C653ED19ad25aff2107` |
| SecretMarketplace | `0x366924196Df3990ef1Ab1b14cBF1beAdE1e5F496` |

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
EXAMPLE_PREDICTION_MARKET_ADDRESS=0x73b9beC7D6924D90Fc9F1C653ED19ad25aff2107 \
QUESTION="The New York Yankees won the 2009 World Series." \
forge script script/CreateMarket.s.sol --rpc-url $RPC_URL --broadcast
```

## Create an Auction on SecretMarketplace

```bash
cd contracts

SECRET_MARKETPLACE_ADDRESS=0x366924196Df3990ef1Ab1b14cBF1beAdE1e5F496 \
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

SECRET_MARKETPLACE_ADDRESS=0x366924196Df3990ef1Ab1b14cBF1beAdE1e5F496 \
AUCTION_ID=0 \
forge script script/secret-marketplace/CloseAuction.s.sol --rpc-url $RPC_URL --broadcast
```

### Force Close (owner only)

Force-closes an auction regardless of expiry. Refunds the highest bidder and adjusts seller reputation.

```bash
cd contracts

SECRET_MARKETPLACE_ADDRESS=0x366924196Df3990ef1Ab1b14cBF1beAdE1e5F496 \
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
