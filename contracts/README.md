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
| `DeploySimpleMarket.s.sol` | Deploy SimpleMarket | `PAYMENT_TOKEN`, `CRE_FORWARDER_ADDRESS` |
| `DeploySecretMarketplace.s.sol` | Deploy SecretMarketplace | `PAYMENT_TOKEN`, `SIMPLE_MARKET_ADDRESS`, `CRE_FORWARDER_ADDRESS` |
| `DeployAll.s.sol` | Deploy everything | `CRE_FORWARDER_ADDRESS` |

### SimpleMarket

| Script | Purpose | Extra env vars |
|--------|---------|----------------|
| `CreateMarket.s.sol` | Create a new prediction market | `SIMPLE_MARKET_ADDRESS`, `QUESTION` |
| `MintMockUSDC.s.sol` | Mint USDC to an address | `MOCK_USDC_ADDRESS` |

### SecretMarketplace (`script/secret-marketplace/`)

| Script | Purpose | Extra env vars |
|--------|---------|----------------|
| `CreateAuction.s.sol` | Create an auction | `SECRET_MARKETPLACE_ADDRESS`, `EXTERNAL_MARKET_ID`, `RESERVE_PRICE`, `AUCTION_DURATION` |
| `PlaceBid.s.sol` | Place a bid | `SECRET_MARKETPLACE_ADDRESS`, `MOCK_USDC_ADDRESS`, `AUCTION_ID`, `BID_AMOUNT` |
| `CloseAuction.s.sol` | Close an expired auction | `SECRET_MARKETPLACE_ADDRESS`, `AUCTION_ID` |
| `ForceCloseAuction.s.sol` | Force-close an auction | `SECRET_MARKETPLACE_ADDRESS`, `AUCTION_ID`, `REPUTATION_DELTA` |

---

## Compliant Private Token Transfer

See [PRIVATE_TOKENS.md](PRIVATE_TOKENS.md) for the full Chainlink ACE tutorial (deploy token, deposit, private transfers, withdrawal).
