# Event Watcher

Long-running background process that monitors the Ethereum Sepolia chain for on-chain events and triggers [CRE](https://docs.chain.link/cre) (Chainlink Runtime Environment) workflow simulations in response.

## Why this exists

In production, CRE workflows are deployed to the Chainlink DON (Decentralized Oracle Network), which continuously monitors the chain and automatically invokes workflows when matching log events or cron schedules fire. Deployed workflows are always-on — no external orchestration needed.

However, **simulated CRE workflows (`cre workflow simulate`) are one-shot processes**. Each invocation processes a single trigger event and exits. There is no way to run a simulated workflow as a continuous log watcher. The event watcher bridges this gap during development by detecting on-chain events and invoking the appropriate `cre workflow simulate` command for each one, giving us the same snappy automatic coordination we'd get in a live CRE deployment.

## What it watches

| Watcher | Trigger | CRE Workflow | Transport |
|---------|---------|-------------|-----------|
| Auction cancelled | `AuctionCancelled` event on SecretMarketplace | `auction-cancelled-handler` | WebSocket |
| Settlement requested | `SettlementRequested` event on ExamplePredictionMarket | `external-prediction-market-settler` | WebSocket |
| Settlement response | `SettlementResponse` event on ExamplePredictionMarket | `external-marketplace-settlement-resolved-handler` | WebSocket |
| Auction closed | `getOpenAuctions()` contract read (no event emitted for expiry) | `secret-marketplace-auction-closer` | HTTP poll (30s) |

## How it works

1. **Startup catch-up**: Loads last-processed block from `.watcher-state.json`, replays any missed events using `getLogs` over HTTP
2. **Real-time subscriptions**: Opens WebSocket connections for `AuctionCancelled`, `SettlementRequested`, and `SettlementResponse` events
3. **Polling**: Checks for expired auctions every 30 seconds via HTTP (`getOpenAuctions()` + `getAuction()`)
4. **CRE invocation**: When an event is detected, runs `cre workflow simulate` with the relevant tx hash and event index

## Usage

```bash
# From repo root
pnpm watch

# From this directory
pnpm start
```

## Environment

Reads from `.env` in this directory (or inherits from parent).

| Variable | Default | Description |
|----------|---------|-------------|
| `RPC_URL` | `https://eth-sepolia.g.alchemy.com/v2/59LCREaM5uGpTVXZgR8A7z6IiULWjwG6` | Ethereum Sepolia RPC endpoint |
| `NTFY_USER` | `UNKNOWN` | Identifier for the sender (e.g. `ad0ll`, `vps`). Prefixed to all notifications so recipients know which instance sent them. |
| `NTFY_HOST` | `http://localhost:8090` | [ntfy](https://ntfy.sh) server base URL for push notifications |

## Notifications

Sends best-effort push notifications to an [ntfy](https://ntfy.sh) server when events are received and CRE workflows complete (or fail). All messages are prefixed with `[NTFY_USER]` so you can tell which instance (local dev vs VPS) triggered the notification. Notification failures are silently ignored. Subscribe at `http://195.201.8.147:8090/event-watcher` or via the ntfy app.

## Deployment

The `event-watcher.service` systemd unit file is included for deploying this as a background service on a remote server. An ntfy instance runs on the same server via Docker (`docker run -d --name ntfy --restart unless-stopped -p 8090:80 binwiederhier/ntfy serve`).
