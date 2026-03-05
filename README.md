# Insider Streams

AI-powered prediction market with a secret marketplace for auctioning insider information, built on Chainlink Runtime Environment (CRE).

## Quick Start

```bash
pnpm install

# Build contracts
pnpm build:contracts

# Run contract tests
pnpm test:contracts

# Generate wagmi types (after contract changes)
pnpm wagmi

# Run E2E test on Eth Sepolia
pnpm e2e

# Start frontend
pnpm dev:insider-streams
```

## Wagmi Type Generation

After modifying any contract ABI (adding/removing functions, events, errors), regenerate the shared TypeScript types:

```bash
pnpm wagmi
```

This runs `wagmi generate` in `packages/contracts/`, reading Foundry artifacts from `contracts/out/` and writing to `packages/contracts/src/generated.ts`. The generated ABIs are re-exported from `@private-streams/contracts` and used by scripts and frontends.

Config: `packages/contracts/wagmi.config.ts`

## Deployed Contracts (Eth Sepolia)

| Contract | Address |
|----------|---------|
| MockUSDC | `0xD6e91E517EC7AD3b28CD4Fe7FEEF79ccf3f32349` |
| SimpleMarket | `0x6A9129C27E3d5e344f1c5cAe59919D8Ba7Fa7416` |
| SecretMarketplace | `0x77A0cA621FE34B5cdbB7470D14b9EFb32821446c` |

Deploy block: `10386966`
