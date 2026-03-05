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
| MockUSDC | `0x0Ac553C843537176ef748Fc559fE33E9D79F2a38` |
| SimpleMarket | `0xEF87D346448aC3aFA3fD15E6e1d22e6B86bf054E` |
| SecretMarketplace | `0xD0Ad321ab6c124C211Acd0bf98f569b2950F3c9b` |
