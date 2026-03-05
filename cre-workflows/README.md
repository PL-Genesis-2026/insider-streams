# CRE Workflows

[Chainlink Runtime Environment (CRE)](https://docs.chain.link/cre) workflows for automated on-chain operations.

## Workflows

### prediction-market-demo

Settles SimpleMarket prediction markets using Gemini AI.

**Trigger:** EVM log — listens for `SettlementRequested(uint256 marketId, string question)` events.

**Flow:**
1. Decode event → extract `marketId` and `question`
2. Query Gemini AI with Google Search grounding → `YES` / `NO` / `INCONCLUSIVE` + confidence score
3. Sign and submit settlement report on-chain via `SimpleMarket.onReport()`
4. Write settlement data to Firestore for audit trail

**Files:**
| File | Purpose |
|------|---------|
| `main.ts` | Log trigger handler, orchestration |
| `gemini.ts` | Gemini API integration |
| `evm.ts` | Report signing and submission |
| `firebase.ts` | Firestore audit trail |
| `types.ts` | Config schema, Zod validation |

**Run:**
```bash
cd cre-workflows

# Interactive (picks up live events)
cre workflow simulate prediction-market-demo --target local-simulation

# Non-interactive (replay a specific tx)
cre workflow simulate prediction-market-demo --target local-simulation \
  --evm-tx-hash <TX_HASH> --evm-event-index 0 --non-interactive --trigger-index 0

# Broadcast (actually settle on-chain)
cre workflow simulate prediction-market-demo --target local-simulation \
  --evm-tx-hash <TX_HASH> --evm-event-index 0 --non-interactive --trigger-index 0 --broadcast
```

**Secrets required:** `GEMINI_API_KEY`, `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID` (in `secrets.yaml` / `.env`)

---

### auction-closer

Automatically closes expired SecretMarketplace auctions.

**Trigger:** Cron — fires every 30 seconds.

**Flow:**
1. Call `getOpenAuctions()` on SecretMarketplace
2. For each open auction, call `getAuction(id)` and check if `endTime <= now`
3. For each expired auction, encode `ACTION_CLOSE_AUCTION` report and submit via `onReport()`

**Files:**
| File | Purpose |
|------|---------|
| `main.ts` | Cron trigger handler, orchestration |
| `monitor.ts` | On-chain reads — find expired auctions |
| `close.ts` | Report encoding, signing, submission |
| `types.ts` | Config schema, ABI re-export |

**Run:**
```bash
cd cre-workflows

# Dry run
cre workflow simulate auction-closer --target local-simulation --non-interactive --trigger-index 0

# Broadcast (actually close on-chain)
cre workflow simulate auction-closer --target local-simulation --non-interactive --trigger-index 0 --broadcast
```

**Secrets required:** None (no external APIs).

---

## Project Structure

```
cre-workflows/
├── prediction-market-demo/   # Gemini AI market settlement
├── auction-closer/           # Cron-based auction closing
├── project.yaml              # CRE project settings (RPC endpoints)
├── secrets.yaml              # Secret values (gitignored)
└── .env                      # Environment variables (gitignored)
```

## CRE Capabilities Used

| Capability | prediction-market-demo | auction-closer |
|------------|----------------------|----------------|
| EVM Log Trigger | `SettlementRequested` events | — |
| Cron Trigger | — | Every 30 seconds |
| HTTP | Gemini API, Firestore API | — |
| EVM Read (`callContract`) | — | `getOpenAuctions()`, `getAuction()` |
| EVM Write (`writeReport`) | Settlement report | Close auction report |
| Report Signing (ECDSA) | Yes | Yes |

## Setup

1. [Install CRE CLI](https://docs.chain.link/cre/getting-started/cli-installation/macos-linux)
2. Copy `.env.example` to `.env` and fill in values
3. Install deps: `cd prediction-market-demo && bun install` (repeat for `auction-closer`)
4. Run workflows using the commands above
