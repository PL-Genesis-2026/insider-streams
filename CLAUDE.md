# Private Streams

AI-powered prediction market built on Chainlink Runtime Environment (CRE) with Google Gemini AI, deployed on Base Sepolia.

## Project Structure

```
private-streams/
├── apps/
│   ├── prediction-market-frontend/  # Next.js — settlement history UI (Firebase/Firestore)
│   └── insider-streams-frontend/    # Next.js — main app (scaffolded, not yet built)
├── packages/common/                 # Shared utilities (@private-streams/common)
├── contracts/                       # Foundry — MockUSDC + SimpleMarket + Compliant Private Transfer
├── cre-workflow/                    # CRE TypeScript workflow — Gemini AI settlement (Bun-managed)
├── prediction-market-e2e.sh         # Full E2E test script
└── CLAUDE.md
```

## Package Management

- **pnpm** workspace for `apps/*`, `packages/*`, `contracts/api-scripts`
- **Bun** for `cre-workflow/prediction-market-demo` (CRE SDK requires Bun)
- `cre-workflow/` is NOT in the pnpm workspace

## Key Commands

```bash
# Contracts
cd contracts && forge build --via-ir
cd contracts && forge test --via-ir

# Frontends
pnpm --filter prediction-market-frontend dev
pnpm --filter insider-streams-frontend dev

# CRE Workflow (from cre-workflow/)
cre workflow simulate prediction-market-demo --target local-simulation
cre workflow simulate prediction-market-demo --target local-simulation --broadcast

# CRE Workflow (non-interactive, for scripts)
cre workflow simulate prediction-market-demo --target local-simulation \
  --evm-tx-hash <TX_HASH> --evm-event-index 0 --non-interactive --trigger-index 0

# E2E Test (runs full market lifecycle)
./prediction-market-e2e.sh
```

## Chain & Network

- **Chain**: Base Sepolia (chain ID: 84532)
- **RPC**: `https://base-sepolia-rpc.publicnode.com`
- **Chain selector** (CRE): `ethereum-testnet-sepolia-base-1`
- **CRE Simulation Forwarder**: `0x82300bd7c3958625581cc2f77bc6464dcecdf3e5`

## Wallets

| Role | Address | Purpose |
|------|---------|---------|
| Owner | `0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5` | Deploys contracts, creates markets, requests settlement |
| Tester | `0x55D234274608a69a3E84c8Bc5Cd07F8A5f0f69Ce` | Makes predictions, claims winnings |

Private keys are in `.env` files (never committed).

## Deployed Contracts (Base Sepolia)

- **MockUSDC**: `0xB308Ef20527c5215ec2B2B10F52b311f3AAc6EEB` (6 decimals, public `mint()`)
- **SimpleMarket**: `0xD9e0f259b1Be422Fd4E24aFFc0d5E63dF8c4e785`

### SimpleMarket Events

- `MarketCreated(uint256 indexed marketId, address indexed creator, string question, uint256 marketOpen, uint256 marketClose)`
- `PredictionMade(uint256 indexed marketId, address indexed predictor, Outcome indexed outcome, uint256 amount, uint256 predCountNo, uint256 predCountYes, uint256 predTotalNo, uint256 predTotalYes)`
- `SettlementRequested(uint256 indexed marketId, string question)`
- `SettlementResponse(uint256 indexed marketId, Status indexed status, Outcome indexed outcome)`

## Deployed Contracts (Eth Sepolia — Compliant Private Transfer)

- **SimpleToken** (DemoToken/DEMO): `0xB308Ef20527c5215ec2B2B10F52b311f3AAc6EEB` (18 decimals)
- **PolicyEngine proxy**: `0xb208a00A90839246C9f6008EaDD71177e78D4EA1`
- **Vault** (pre-existing): `0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13`
- **Private Token API**: `https://convergence2026-token-api.cldev.cloud` ([docs](https://convergence2026-token-api.cldev.cloud/docs))

## Services

- **Firebase project**: `chainlink-cre-d6748` (billing enabled, $1 + $10 budget alerts)
- **Firestore**: `demo` collection for settlement audit trail
- **Gemini AI**: `gemini-3.1-flash-lite-preview` model for fact-checking with Google Search grounding
- API keys/secrets are in `.env` files, never in code

## Environment Files

| File | Purpose |
|------|---------|
| `.env` (root) | All PKs, RPC, contract addresses, API keys |
| `contracts/.env` | `PRIVATE_KEY`, `RPC_URL` for Foundry scripts |
| `cre-workflow/.env` | CRE private key, Gemini key, Firebase keys |
| `apps/prediction-market-frontend/.env.local` | `NEXT_PUBLIC_FIREBASE_*` vars |

## Architecture Notes

- `SimpleMarket.sol` accepts **any ERC-20** token (constructor arg) — we use MockUSDC, not Circle USDC
- Markets close after **3 minutes** from creation
- CRE workflow listens for `SettlementRequested` events, calls Gemini AI with Google Search grounding, submits signed report on-chain
- Settlement data is also written to Firestore for the frontend
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

### Demos & Examples
- [CRE Prediction Market Demo](https://github.com/smartcontractkit/cre-gcp-prediction-market-demo)
- [CRE Bootcamp 2026](https://github.com/smartcontractkit/cre-bootcamp-2026)
- [Compliant Private Transfer Demo](https://github.com/smartcontractkit/Compliant-Private-Transfer-Demo)
- [Firebase Setup Guide](https://github.com/smartcontractkit/cre-gcp-prediction-market-demo/blob/main/firebase-setup.md)
