# Contracts

## Build & Test

```bash
forge build --via-ir
forge test --via-ir
```

## Regenerate Contract Types

After modifying contracts, run from the project root:

```bash
./scripts/generate-contract-types.sh --skip-deploy
```

This compiles contracts, regenerates wagmi TypeScript types in `packages/common/`, copies ABIs to the subgraph and frontend apps.

## Foundry Scripts

All scripts require `PRIVATE_KEY` and `RPC_URL` env vars. Run with `forge script <path> --rpc-url $RPC_URL --broadcast`.

### Deployment

| Script | Purpose | Extra env vars |
|--------|---------|----------------|
| `DeployMockUSDC.s.sol` | Deploy MockUSDC token | — |
| `DeployExamplePredictionMarket.s.sol` | Deploy ExamplePredictionMarket | `MOCK_USDC_ADDRESS`, `CRE_FORWARDER_ADDRESS` |
| `DeploySecretMarketplace.s.sol` | Deploy SecretMarketplace | `MOCK_USDC_ADDRESS`, `EXAMPLE_PREDICTION_MARKET_ADDRESS`, `CRE_FORWARDER_ADDRESS` |
| `DeployAll.s.sol` | Deploy everything | `CRE_FORWARDER_ADDRESS` |

### ExamplePredictionMarket

| Script | Purpose | Extra env vars |
|--------|---------|----------------|
| `CreateEvent.s.sol` | Create a new prediction event | `EXAMPLE_PREDICTION_MARKET_ADDRESS`, `QUESTION` |
| `ForceSettle.s.sol` | Force-settle an event (debug) | `EXAMPLE_PREDICTION_MARKET_ADDRESS`, `EVENT_ID`, `OUTCOME` |
| `MintMockUSDC.s.sol` | Mint USDC to an address | `MOCK_USDC_ADDRESS` |

### SecretMarketplace (`script/secret-marketplace/`)

| Script | Purpose | Extra env vars |
|--------|---------|----------------|
| `CreateAuction.s.sol` | Create an auction | `SECRET_MARKETPLACE_ADDRESS`, `EVENT_ID`, `SELLER_NAME`, `EVENT_TITLE`, `AUCTION_DURATION` |
| `PlaceBid.s.sol` | Place a bid | `SECRET_MARKETPLACE_ADDRESS`, `MOCK_USDC_ADDRESS`, `AUCTION_ID`, `BID_AMOUNT` |
| `CloseAuction.s.sol` | Close an expired auction | `SECRET_MARKETPLACE_ADDRESS`, `AUCTION_ID` |
| `ForceCloseAuction.s.sol` | Force-close an auction | `SECRET_MARKETPLACE_ADDRESS`, `AUCTION_ID`, `REPUTATION_DELTA` |

---

## Compliant Private Token Transfer

See [PRIVATE_TOKENS.md](PRIVATE_TOKENS.md) for the full Chainlink ACE tutorial (deploy token, deposit, private transfers, withdrawal).
