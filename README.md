# Insider Streams

Encrypted prediction marketplace built on [Zama fhEVM](https://docs.zama.ai/fhevm) with Fully Homomorphic Encryption (FHE) privacy. Users trade secret predictions on real-world events with encrypted bids, encrypted balances, and pseudonymous identities.

## Links

- [Video](https://www.youtube.com/watch?v=sGsNvkky2xc)
- [Insider Streams frontend](https://insider-streams-insider-streams-fro.vercel.app/)

## Architecture

![Architecture](./docs/architecture.png)

### Contracts (`contracts-fhe/`)

Four Hardhat contracts deployed on Ethereum Sepolia using Zama's fhEVM plugin:

| Contract | Description |
|---|---|
| **FHESecretMarketplace** | Core marketplace — encrypted bids (`euint64`), encrypted balances, pseudonymous user IDs, auction lifecycle, reputation scoring |
| **FHEConfidentialUSDC** | ERC-7984 encrypted payment token for the marketplace |
| **ExamplePredictionMarket** | Public prediction market (plain ERC-20) — events, bets, AI-powered settlement |
| **MockUSDC** | Plain ERC-20 token for the prediction market |

### Daemon (`apps/daemon/`)

Unified Express server with background services:

- **Settler** — watches `SettlementRequested` events, calls Gemini AI with Google Search grounding, settles events on-chain
- **Auction Closer** — polls for expired auctions, closes them, marks winning bids; watches `AuctionCancelled` events
- **Reputation Resolver** — watches `SettlementResponse` events, resolves per-auction predictions against actual outcomes
- **Deposit Watcher** — monitors on-chain deposits
- **HTTP API** — signature-authenticated endpoints (`/user`, `/balance`, `/bid`, `/create-auction`, `/deposit`, `/withdraw`, `/faucet`, etc.)

### Frontend (`apps/insider-streams-frontend/`)

Next.js app with wallet connection (Reown/WalletConnect), Apollo Client for subgraph queries, and daemon API integration.

## Deployed Contracts (Eth Sepolia)

| Contract | Address |
|---|---|
| MockUSDC | [`0x7Dd00c06B6123dFCaF23F6647Eb6f19eC21abD33`](https://sepolia.etherscan.io/address/0x7Dd00c06B6123dFCaF23F6647Eb6f19eC21abD33) |
| FHEConfidentialUSDC | [`0xee3A0Cccb31fF816615C18E1d1DB480df8a0f9F1`](https://sepolia.etherscan.io/address/0xee3A0Cccb31fF816615C18E1d1DB480df8a0f9F1) |
| ExamplePredictionMarket | [`0x791550c705B2272E1D6EC617AB18337f4E5712E8`](https://sepolia.etherscan.io/address/0x791550c705B2272E1D6EC617AB18337f4E5712E8) |
| FHESecretMarketplace | [`0x0056F94eCC59B918a225B433401EE5121506171B`](https://sepolia.etherscan.io/address/0x0056F94eCC59B918a225B433401EE5121506171B) |

## Quick Start

```bash
pnpm install

# Start the frontend
pnpm dev:insider-streams

# Start the daemon (in a separate terminal)
cd apps/daemon && pnpm start

# Populate with test data (in a separate terminal)
cd scripts && pnpm run-demo
```

## Demo Scripts

The `run-demo` orchestrator runs all population scripts together:

```bash
cd scripts && pnpm run-demo
```

Individual scripts:

| Script | Description |
|---|---|
| `pnpm create-events` | Generate AI prediction events and place random bets |
| `pnpm spawn-auctions` | Create auctions on open events via daemon API |
| `pnpm place-bids` | Place bids on open auctions via daemon API |
| `pnpm request-settlements` | Request settlement for closed prediction events |

## Testing

```bash
# Daemon unit tests
cd apps/daemon && pnpm test:db       # SQLite bid tracking (11 tests)
cd apps/daemon && pnpm test:e2e      # API E2E tests (52 tests)
cd apps/daemon && pnpm test:sepolia  # Sepolia FHE integration tests

# Contract tests
cd contracts-fhe && npx hardhat test                  # Local (mock FHE)
cd contracts-fhe && npx hardhat test --network sepolia  # Sepolia (real FHE)

# Frontend Playwright tests
cd apps/insider-streams-frontend && pnpm test:playwright

# On-chain E2E
cd scripts && pnpm e2e:secret-marketplace
```

## Project Structure

```
private-streams/
├── apps/
│   ├── insider-streams-frontend/    # Next.js marketplace UI
│   └── daemon/                      # Express daemon (settler, closer, resolver, API)
├── packages/
│   └── common/                      # Shared ABIs, addresses, utilities
├── contracts-fhe/                   # Hardhat + fhEVM contracts
├── subgraphs/secrets-marketplace/   # The Graph subgraph
├── scripts/                         # Demo scripts, E2E tests, deploy helpers
└── docs/                            # Architecture diagrams, plans
```
