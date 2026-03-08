# Create Events Script Design

## Overview

A cron-friendly TypeScript script that generates prediction market events with known real-world outcomes and places random bets on them. Demonstrates the full system lifecycle: event creation, betting, and eventual AI-powered settlement.

## Location

`scripts/create-events.ts` — runs via `pnpm create-events` from `scripts/`.

## Flow

### 1. Fetch existing events from subgraph

Query `eventCreateds` (top 50, ordered by `blockTimestamp` desc) to get existing market questions. Pass these to Venice AI as deduplication context.

### 2. Generate new event ideas via Venice AI

- OpenAI SDK pointed at `https://api.venice.ai/api/v1`
- Model: `openai-gpt-54`
- Zod structured output: array of 1-3 event objects with `question` field
- Prompt instructs AI to:
  - Suggest past real-world events with known outcomes (sports, awards, elections, etc.)
  - Phrase them as if the outcome is unknown ("Will X win Y?")
  - Avoid duplicating existing event questions

### 3. Create events on-chain

For each generated question:
- Ensure owner has CUSDC balance (auto-mint if needed)
- Ensure owner has approved the prediction market contract
- Call `newEvent(question, duration)` with duration randomly chosen between 1800s (30 min) and 3600s (1 hour)
- Extract `eventId` from `EventCreated` log

### 4. Place random bets

For each created event:
- Pick 5-10 random test accounts from `TEST_ACCOUNT_1` through `TEST_ACCOUNT_25`
- For each selected account:
  - Ensure CUSDC balance (owner mints)
  - Ensure CUSDC approval for prediction market
  - Call `buyShares(eventId, outcome, amount)` with random outcome (Yes=2/No=1) and random amount ($10-$500 USDC, 6-decimal units)

## New Dependencies

Add to `scripts/package.json`:
- `openai` — OpenAI-compatible SDK for Venice AI
- `zod` — Structured output schema

## New GraphQL Query

`scripts/queries/create-events.graphql`:
```graphql
query ExistingEvents($limit: Int!) {
  eventCreateds(first: $limit, orderBy: blockTimestamp, orderDirection: desc) {
    eventId
    question
  }
}
```

Run `pnpm codegen` after adding.

## Environment Variables

- `OWNER_PK` — creates events, mints CUSDC
- `TEST_ACCOUNT_1` through `TEST_ACCOUNT_25` — bet placers
- `RPC_URL` — Sepolia RPC
- `VENICE_API_KEY` — Venice AI API key

## Error Handling

- Venice AI returns fewer events than requested: proceed with what we get
- Bet transaction fails: log and continue with next bet
- Sequential transactions per account to avoid nonce conflicts
