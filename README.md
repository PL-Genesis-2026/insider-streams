# Insider Streams

Encrypted prediction marketplace built on [Zama fhEVM](https://docs.zama.ai/fhevm) with Fully Homomorphic Encryption (FHE) privacy. Users trade secret predictions on real-world events with encrypted bids, encrypted balances, and pseudonymous identities.

## Links

- [Video](https://www.youtube.com/watch?v=sGsNvkky2xc)
- [Insider Streams frontend](https://insider-streams-insider-streams-fro.vercel.app/)

## Architecture

```mermaid
graph TD
    subgraph Users
        U[Browser + Wallet]
    end

    subgraph Frontends
        ISF[Insider Streams Frontend<br/><i>Next.js · port 3000</i>]
        PMF[Prediction Market Frontend<br/><i>Next.js · port 3100</i>]
    end

    subgraph Daemon["Daemon (Express)"]
        API[HTTP API<br/><i>Signature-authenticated endpoints</i>]
        DB[(SQLite<br/><i>users · bids · secrets</i>)]
        S[Settler]
        AC[Auction Closer]
        RR[Reputation Resolver]
    end

    subgraph Chain["Ethereum Sepolia"]
        SM[FHESecretMarketplace<br/><i>Encrypted bids · balances · predictions</i>]
        CUSD[FHEConfidentialUSDC<br/><i>ERC-7984 encrypted token</i>]
        EPM[ExamplePredictionMarket<br/><i>Public binary market</i>]
        MUSD[MockUSDC<br/><i>Plain ERC-20</i>]
    end

    subgraph External["External Services"]
        ZR[Zama FHE Relayer<br/><i>Encrypt inputs · decrypt proofs</i>]
        TG[The Graph Subgraph<br/><i>Indexes on-chain events</i>]
        GM[Gemini AI<br/><i>Google Search grounding</i>]
        FS[Firebase Firestore<br/><i>Settlement audit trail</i>]
    end

    CRON[Cron Scripts<br/><i>create-events · spawn-auctions<br/>place-bids · request-settlements</i>]

    U -->|WalletConnect| ISF
    U -->|WalletConnect| PMF
    ISF -->|Signed POST requests| API
    ISF -->|GraphQL| TG
    PMF -->|Direct wallet txs| EPM
    PMF -->|GraphQL| TG

    API --> DB
    API -->|FHE encrypt| ZR
    API -->|Admin EOA txs| SM
    API -->|Admin EOA txs| CUSD

    S -->|Fact-check| GM
    S -->|settleEvent| EPM
    S -->|Audit trail| FS
    AC -->|closeAuction + finalize| SM
    AC -->|Decrypt winning bid| ZR
    RR -->|resolveEventPredictions| SM
    RR -->|Decrypt result| ZR
    RR -->|finalizeReputationResult| SM

    SM <-->|Transfer encrypted tokens| CUSD
    EPM <-->|Transfer tokens| MUSD

    SM -->|Events| TG
    EPM -->|Events| TG

    CRON -->|API calls| API

    classDef fhe fill:#4a2882,stroke:#7c3aed,color:#fff
    classDef plain fill:#1e3a5f,stroke:#3b82f6,color:#fff
    classDef service fill:#1a4731,stroke:#22c55e,color:#fff
    classDef external fill:#7c2d12,stroke:#f97316,color:#fff

    class SM,CUSD fhe
    class EPM,MUSD plain
    class API,S,AC,RR service
    class ZR,TG,GM,FS external
```

### Auction Lifecycle

```mermaid
sequenceDiagram
    participant Seller
    participant Bidder
    participant API as Daemon API
    participant FHE as Zama FHE Relayer
    participant MKT as FHESecretMarketplace
    participant SUB as Subgraph
    participant AC as Auction Closer
    participant PM as ExamplePredictionMarket
    participant STL as Settler
    participant RR as Reputation Resolver

    Note over Seller,SUB: Auction Creation
    Seller->>API: POST /create-auction (prediction + secret)
    API->>FHE: Encrypt prediction (ebool) + secretKey (euint256)
    FHE-->>API: Encrypted handles + proof
    API->>MKT: createAuction() via admin EOA
    MKT-->>SUB: AuctionCreated event

    Note over Bidder,SUB: Bidding
    Bidder->>API: POST /bid (auctionId, amount)
    API->>FHE: Encrypt bid amount (euint64)
    FHE-->>API: Encrypted handle + proof
    API->>MKT: placeBid() — deducts balance, refunds previous bidder
    MKT-->>SUB: BidPlaced event (no bidder address)

    Note over AC,SUB: Auction Close (2-step FHE)
    AC->>MKT: closeAuction() — marks closed
    AC->>FHE: publicDecrypt(winningBid)
    FHE-->>AC: Decrypted value + proof
    AC->>MKT: finalizeAuctionClose(proof)
    MKT-->>SUB: AuctionClosed event

    Note over STL,PM: AI Settlement
    STL->>PM: Watches SettlementRequested
    STL->>STL: Gemini AI fact-check with Google Search
    STL->>PM: settleEvent(outcome, confidence)
    PM-->>SUB: SettlementResponse event

    Note over RR,MKT: Reputation Resolution (2-step FHE)
    RR->>MKT: resolveEventPredictions() — FHE.eq(prediction, outcome)
    RR->>FHE: publicDecrypt(isCorrect)
    FHE-->>RR: Boolean + proof
    RR->>MKT: finalizeReputationResult(proof) — seller score ±1
    MKT-->>SUB: SellerReputationScoreUpdated
```

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
- **Reputation Resolver** — watches `SettlementResponse` events, resolves per-auction predictions against actual outcomes via 2-step FHE decryption
- **HTTP API** — signature-authenticated endpoints (`/user`, `/balance`, `/bid`, `/create-auction`, `/deposit`, `/withdraw`, `/faucet`, etc.)

### Insider Streams Frontend (`apps/insider-streams-frontend/`)

Next.js app (port 3000) — encrypted auction marketplace. Wallet connection (Reown/WalletConnect), Apollo Client for subgraph queries, and daemon API integration. Users create auctions, place encrypted bids, manage balances.

### Prediction Market Frontend (`apps/prediction-market-frontend/`)

Next.js app (port 3100) — public prediction market. Users buy YES/NO shares on events using MockUSDC (plain ERC-20). After purchasing shares, users can create private auctions on the Insider Streams marketplace to sell their signal.

## Deployed Contracts (Eth Sepolia)

| Contract | Address |
|---|---|
| MockUSDC | [`0x1Cd05cf3c20Cd64f6803C1777C6373e47872944c`](https://sepolia.etherscan.io/address/0x1Cd05cf3c20Cd64f6803C1777C6373e47872944c) |
| FHEConfidentialUSDC | [`0x1f54Afd38756089cd2B8852e5014C6ccf1299b57`](https://sepolia.etherscan.io/address/0x1f54Afd38756089cd2B8852e5014C6ccf1299b57) |
| ExamplePredictionMarket | [`0x7C22C1b9B2a4575089a996E98c877b996eBbBAA2`](https://sepolia.etherscan.io/address/0x7C22C1b9B2a4575089a996E98c877b996eBbBAA2) |
| FHESecretMarketplace | [`0xf74884348F7153c63A46a1e362ec6D90E754Cf15`](https://sepolia.etherscan.io/address/0xf74884348F7153c63A46a1e362ec6D90E754Cf15) |

## Quick Start

```bash
pnpm install

# Start the Insider Streams frontend (encrypted marketplace, port 3000)
pnpm dev:insider-streams

# Start the Prediction Market frontend (public market, port 3100)
pnpm dev:prediction-market

# Start the daemon (in a separate terminal)
cd apps/daemon && pnpm start
```

## Demo Scripts

Standalone scripts for populating the marketplace with test data. Run one-shot from `scripts/` or schedule via OS cron:

| Script | Cron | Description |
|---|---|---|
| `pnpm create-events` | `*/15 * * * *` | Generate AI prediction events and place random bets |
| `pnpm spawn-auctions` | `*/10 * * * *` | Create auctions on open events via daemon API |
| `pnpm place-bids` | `* * * * *` | Place bids on open auctions via daemon API |
| `pnpm request-settlements` | `* * * * *` | Request settlement for closed prediction events |

Requires `OWNER_PK`, `TEST_ACCOUNT_1..25`, `RPC_URL`, `VENICE_API_KEY`, and `DAEMON_URL` in `scripts/.env`.

## Testing

```bash
# Daemon unit tests
cd apps/daemon && pnpm test:db       # SQLite bid tracking (11 tests)
cd apps/daemon && pnpm test:e2e      # API E2E tests (52 tests)
cd apps/daemon && pnpm test:sepolia  # Sepolia FHE integration tests
cd apps/daemon && pnpm test:lifecycle  # Full lifecycle E2E (Sepolia, ~3 min)

# Contract tests
cd contracts-fhe && npx hardhat test                  # Local (mock FHE)
cd contracts-fhe && npx hardhat test --network sepolia  # Sepolia (real FHE)

# Frontend Playwright tests
cd apps/insider-streams-frontend && pnpm test:playwright
```

## Project Structure

```
private-streams/
├── apps/
│   ├── insider-streams-frontend/    # Next.js marketplace UI (port 3000)
│   ├── prediction-market-frontend/  # Next.js prediction market UI (port 3100)
│   └── daemon/                      # Express daemon (settler, closer, resolver, API)
├── packages/
│   └── common/                      # Shared ABIs, addresses, utilities
├── contracts-fhe/                   # Hardhat + fhEVM contracts
├── subgraphs/secrets-marketplace/   # The Graph subgraph
├── scripts/                         # Demo scripts, deploy helpers
└── docs/                            # Architecture diagrams, plans
```
