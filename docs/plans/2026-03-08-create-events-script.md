# Create Events Script Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a cron-friendly script that generates prediction market events using Venice AI and places random bets from test accounts.

**Architecture:** Single TypeScript script in `scripts/create-events.ts`. Queries subgraph for existing events to avoid duplicates, asks Venice AI (OpenAI-compatible API) for new event ideas based on real past events with known outcomes, creates them on-chain via `newEvent()`, then places random bets from test accounts via `buyShares()`. Uses existing E2E helpers for CUSDC minting, approvals, and transaction handling.

**Tech Stack:** TypeScript, viem, OpenAI SDK (pointed at Venice AI) with `zodResponseFormat` for structured output, Zod, graphql-request, existing E2E helpers

---

### Task 1: Add dependencies and GraphQL query

**Files:**
- Modify: `scripts/package.json` (add `openai` and `zod` dependencies)
- Create: `scripts/queries/create-events.graphql`

**Step 1: Install new dependencies**

Run from `scripts/`:
```bash
cd /Users/adoll/projects/private-streams/scripts && pnpm add openai zod
```

**Step 2: Create GraphQL query file**

Create `scripts/queries/create-events.graphql`:
```graphql
query ExistingEvents($limit: Int!) {
  eventCreateds(first: $limit, orderBy: blockTimestamp, orderDirection: desc) {
    eventId
    question
  }
}
```

**Step 3: Run codegen to generate typed SDK**

```bash
cd /Users/adoll/projects/private-streams/scripts && pnpm codegen
```

Expected: `__generated__/graphql.ts` now contains `ExistingEventsQuery`, `ExistingEventsQueryVariables`, `ExistingEventsDocument`, and the `getSdk()` function includes an `ExistingEvents` method.

**Step 4: Verify codegen output**

```bash
grep -n "ExistingEvents" /Users/adoll/projects/private-streams/scripts/__generated__/graphql.ts
```

Expected: Multiple hits showing the generated query type and SDK method.

**Step 5: Commit**

```bash
git add scripts/package.json scripts/pnpm-lock.yaml scripts/queries/create-events.graphql scripts/__generated__/graphql.ts
git commit -m "feat: add dependencies and GraphQL query for create-events script"
```

---

### Task 2: Write the create-events script

**Files:**
- Create: `scripts/create-events.ts`
- Modify: `scripts/package.json` (add `create-events` script)
- Modify: `scripts/tsconfig.json` (include new file path if needed)

**Step 1: Add npm script**

Add to `scripts/package.json` `"scripts"` section:
```json
"create-events": "tsx --env-file=.env create-events.ts"
```

**Step 2: Write the script**

Create `scripts/create-events.ts`:

```typescript
/**
 * create-events.ts — Automated prediction market event generator
 *
 * Cron-friendly script that:
 *   1. Fetches existing events from subgraph (deduplication)
 *   2. Asks Venice AI to suggest 1-3 new prediction market questions
 *   3. Creates events on ExamplePredictionMarket
 *   4. Places 5-10 random bets per event from test accounts
 *
 * Env vars required:
 *   OWNER_PK                  — creates events, mints CUSDC
 *   TEST_ACCOUNT_1..25        — private keys for bet-placing accounts
 *   RPC_URL                   — Eth Sepolia RPC
 *   VENICE_API_KEY            — Venice AI API key
 *
 * Usage: pnpm create-events
 */

import "dotenv/config";

import {
  CONFIDENTIAL_USDC_ADDRESS,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  confidentialUsdcAbi,
  examplePredictionMarketAbi,
} from "@private-streams/common";
import { GraphQLClient } from "graphql-request";
import OpenAI from "openai";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { z } from "zod";
import { getSdk } from "./__generated__/graphql";

// ─── Constants ──────────────────────────────────────────────────────────────

const SUBGRAPH_URL =
  "https://api.studio.thegraph.com/query/1743303/insider-streams-2/version/latest";

const USDC_DECIMALS = 6;
const INITIAL_LIQUIDITY = 10_000_000n; // 10 CUSDC (required by newEvent)
const MIN_BALANCE = 10_000_000n; // 10 CUSDC
const MINT_AMOUNT = 10_000_000_000n; // 10,000 CUSDC
const APPROVAL_AMOUNT = 100_000_000_000n; // 100,000 CUSDC
const MIN_ALLOWANCE = 10_000_000n; // 10 CUSDC

const DURATIONS = [1800n, 3600n]; // 30 min or 1 hour
const MIN_BET_USDC = 10; // $10
const MAX_BET_USDC = 500; // $500
const MIN_BETS_PER_EVENT = 5;
const MAX_BETS_PER_EVENT = 10;
const NUM_EVENTS_TO_GENERATE = 3;

// Outcome enum: 1=No, 2=Yes
const OUTCOMES = [1, 2] as const;

// ─── Environment ────────────────────────────────────────────────────────────

function envRequired(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`ERROR: ${name} not set`);
    process.exit(1);
  }
  return val;
}

const OWNER_PK = envRequired("OWNER_PK") as Hex;
const RPC_URL = envRequired("RPC_URL");
const VENICE_API_KEY = envRequired("VENICE_API_KEY");

// Collect all available test account private keys
const testAccounts: { key: Hex; label: string }[] = [];
for (let i = 1; i <= 25; i++) {
  const key = process.env[`TEST_ACCOUNT_${i}`];
  if (key) {
    testAccounts.push({ key: key as Hex, label: `TEST_ACCOUNT_${i}` });
  }
}

if (testAccounts.length === 0) {
  console.error("ERROR: No TEST_ACCOUNT_* keys found in environment");
  process.exit(1);
}

// ─── Clients ────────────────────────────────────────────────────────────────

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const ownerAccount = privateKeyToAccount(OWNER_PK);
const ownerClient = createWalletClient({
  account: ownerAccount,
  chain: sepolia,
  transport: http(RPC_URL),
});

const venice = new OpenAI({
  apiKey: VENICE_API_KEY,
  baseURL: "https://api.venice.ai/api/v1",
});

const subgraphSdk = getSdk(new GraphQLClient(SUBGRAPH_URL));

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForTx(hash: Hex, label: string) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    console.error(`  x ${label} failed`);
    throw new Error(`${label} transaction failed`);
  }
  console.log(`  ok ${label} (tx: ${hash.slice(0, 10)}...)`);
  return receipt;
}

async function ensureBalance(target: Address) {
  const balance = (await publicClient.readContract({
    address: CONFIDENTIAL_USDC_ADDRESS,
    abi: confidentialUsdcAbi,
    functionName: "balanceOf",
    args: [target],
  })) as bigint;

  if (balance < MIN_BALANCE) {
    const h = await ownerClient.writeContract({
      address: CONFIDENTIAL_USDC_ADDRESS,
      abi: confidentialUsdcAbi,
      functionName: "mint",
      args: [target, MINT_AMOUNT],
    });
    await waitForTx(h, `Mint ${formatUnits(MINT_AMOUNT, USDC_DECIMALS)} CUSDC to ${target.slice(0, 8)}...`);
  }
}

async function ensureApproval(
  walletClient: ReturnType<typeof createWalletClient>,
  owner: Address,
) {
  const allowance = (await publicClient.readContract({
    address: CONFIDENTIAL_USDC_ADDRESS,
    abi: confidentialUsdcAbi,
    functionName: "allowance",
    args: [owner, EXAMPLE_PREDICTION_MARKET_ADDRESS],
  })) as bigint;

  if (allowance < MIN_ALLOWANCE) {
    const h = await walletClient.writeContract({
      address: CONFIDENTIAL_USDC_ADDRESS,
      abi: confidentialUsdcAbi,
      functionName: "approve",
      args: [EXAMPLE_PREDICTION_MARKET_ADDRESS, APPROVAL_AMOUNT],
    });
    await waitForTx(h, `Approval for ${owner.slice(0, 8)}...`);
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ─── Venice AI ──────────────────────────────────────────────────────────────

const EventSuggestionSchema = z.object({
  events: z.array(
    z.object({
      question: z.string().describe("The prediction market question, phrased as a future-tense question"),
    }),
  ),
});

async function generateEventQuestions(existingQuestions: string[]): Promise<string[]> {
  const existingList =
    existingQuestions.length > 0
      ? `\n\nEXISTING MARKETS (do NOT duplicate these):\n${existingQuestions.map((q) => `- ${q}`).join("\n")}`
      : "";

  const response = await venice.chat.completions.create({
    model: "openai-gpt-54",
    messages: [
      {
        role: "system",
        content: `You are a prediction market event creator. You suggest prediction market questions based on REAL past events that have KNOWN outcomes. The events must be real and verifiable — things like past Super Bowl winners, Oscar winners, election results, sports championships, major tech acquisitions, etc.

CRITICAL RULES:
1. Each question must be phrased as if the outcome is UNKNOWN — use future tense ("Will X happen?") even though the event already occurred. This is for a prediction market demo.
2. The outcomes must be easily verifiable by an AI with web search access.
3. Keep questions concise (under 150 characters).
4. Cover diverse topics: sports, entertainment, politics, science, tech, business.
5. Do NOT repeat any existing market questions.

Respond with a JSON object containing an "events" array with exactly ${NUM_EVENTS_TO_GENERATE} event objects, each with a "question" field.

Example format:
{"events": [{"question": "Will the Kansas City Chiefs win Super Bowl LVIII?"}]}`,
      },
      {
        role: "user",
        content: `Suggest ${NUM_EVENTS_TO_GENERATE} prediction market questions based on real past events with known outcomes.${existingList}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 1.0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Venice AI returned empty response");
  }

  const parsed = EventSuggestionSchema.safeParse(JSON.parse(content));
  if (!parsed.success) {
    console.error("Venice AI response failed validation:", parsed.error.format());
    throw new Error("Venice AI response did not match expected schema");
  }

  return parsed.data.events.map((e) => e.question);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  Create Prediction Market Events                     ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Owner:     ${ownerAccount.address}`);
  console.log(`  Market:    ${EXAMPLE_PREDICTION_MARKET_ADDRESS}`);
  console.log(`  CUSDC:     ${CONFIDENTIAL_USDC_ADDRESS}`);
  console.log(`  Accounts:  ${testAccounts.length} test accounts loaded`);

  // ── Step 1: Fetch existing events ─────────────────────────────────────────
  console.log("\n━━━ Step 1: Fetching existing events from subgraph ━━━");
  const { eventCreateds } = await subgraphSdk.ExistingEvents({ limit: 50 });
  const existingQuestions = eventCreateds.map((e) => e.question);
  console.log(`  Found ${existingQuestions.length} existing events`);

  // ── Step 2: Generate new event questions via Venice AI ────────────────────
  console.log("\n━━━ Step 2: Generating event questions via Venice AI ━━━");
  const questions = await generateEventQuestions(existingQuestions);
  console.log(`  Generated ${questions.length} new questions:`);
  questions.forEach((q, i) => console.log(`    ${i + 1}. ${q}`));

  // ── Step 3: Ensure owner funding ──────────────────────────────────────────
  console.log("\n━━━ Step 3: Ensuring owner has CUSDC ━━━");
  await ensureBalance(ownerAccount.address);
  await ensureApproval(ownerClient, ownerAccount.address);

  // ── Step 4: Create events on-chain ────────────────────────────────────────
  console.log("\n━━━ Step 4: Creating events on-chain ━━━");
  const createdEvents: { eventId: bigint; question: string }[] = [];

  for (const question of questions) {
    const duration = DURATIONS[randomInt(0, DURATIONS.length - 1)]!;
    console.log(`\n  Creating: "${question}" (duration: ${duration}s)`);

    try {
      const hash = await ownerClient.writeContract({
        address: EXAMPLE_PREDICTION_MARKET_ADDRESS,
        abi: examplePredictionMarketAbi,
        functionName: "newEvent",
        args: [question, duration],
      });
      const receipt = await waitForTx(hash, "Event created");

      const logs = parseEventLogs({
        abi: examplePredictionMarketAbi,
        logs: receipt.logs,
        eventName: "EventCreated",
      });
      const eventId = (logs[0] as { args: { eventId: bigint } }).args.eventId;
      console.log(`  Event ID: ${eventId}`);
      createdEvents.push({ eventId, question });
    } catch (err) {
      console.error(`  x Failed to create event: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (createdEvents.length === 0) {
    console.error("\nNo events were created. Exiting.");
    process.exit(1);
  }

  // ── Step 5: Place random bets ─────────────────────────────────────────────
  console.log("\n━━━ Step 5: Placing random bets ━━━");

  for (const { eventId, question } of createdEvents) {
    const numBets = randomInt(MIN_BETS_PER_EVENT, MAX_BETS_PER_EVENT);
    const selectedAccounts = pickRandom(testAccounts, numBets);
    console.log(`\n  Event ${eventId}: "${question.slice(0, 60)}..." — ${selectedAccounts.length} bets`);

    for (const { key, label } of selectedAccounts) {
      const account = privateKeyToAccount(key);
      const betAmount = BigInt(randomInt(MIN_BET_USDC, MAX_BET_USDC)) * 1_000_000n; // to 6 decimals
      const outcome = OUTCOMES[randomInt(0, 1)]!;
      const outcomeLabel = outcome === 2 ? "YES" : "NO";

      try {
        // Ensure balance and approval
        await ensureBalance(account.address);
        const betterClient = createWalletClient({
          account,
          chain: sepolia,
          transport: http(RPC_URL),
        });
        await ensureApproval(betterClient, account.address);

        // Place bet
        const hash = await betterClient.writeContract({
          address: EXAMPLE_PREDICTION_MARKET_ADDRESS,
          abi: examplePredictionMarketAbi,
          functionName: "buyShares",
          args: [eventId, outcome, betAmount],
        });
        await waitForTx(
          hash,
          `${label} bet $${formatUnits(betAmount, USDC_DECIMALS)} ${outcomeLabel}`,
        );
      } catch (err) {
        console.error(`  x ${label} bet failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  Done                                                ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Created ${createdEvents.length} events:`);
  createdEvents.forEach(({ eventId, question }) =>
    console.log(`    Event ${eventId}: ${question}`),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nx create-events failed:", err);
    process.exit(1);
  });
```

**Step 3: Verify TypeScript compilation**

```bash
cd /Users/adoll/projects/private-streams && turbo run build --filter=@private-streams/scripts
```

Expected: Build passes with no errors.

**Step 4: Commit**

```bash
git add scripts/create-events.ts scripts/package.json
git commit -m "feat: add create-events script for automated market generation"
```

---

### Task 3: Add VENICE_API_KEY to env files

**Files:**
- Modify: `scripts/.env` (add `VENICE_API_KEY`)

**Step 1: Add the key**

Add to `scripts/.env`:
```
VENICE_API_KEY=k8gn2BSeJyzwlzsgeUdmSiy1McfYbZx4TMUF3ftVD1
```

**Step 2: Add to root `.env` as well (if scripts/.env sources from root)**

Check the current scripts `.env` to see if it already loads from root. If not, add to root `.env` too.

Note: Do NOT commit `.env` files.

---

### Task 4: Smoke test

**Step 1: Run the script**

```bash
cd /Users/adoll/projects/private-streams/scripts && pnpm create-events
```

Expected:
1. Fetches existing events from subgraph
2. Venice AI generates 1-3 new questions
3. Creates events on-chain (each costs 10 CUSDC)
4. Places 5-10 random bets per event
5. Prints summary

**Step 2: Verify events on subgraph**

Wait ~30 seconds for indexing, then verify events appear:
```bash
curl -s -X POST 'https://api.studio.thegraph.com/query/1743303/insider-streams-2/version/latest' \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ eventCreateds(first: 5, orderBy: blockTimestamp, orderDirection: desc) { eventId question blockTimestamp } }"}' | python3 -m json.tool
```

**Step 3: If errors occur, debug and fix**

Common issues:
- Venice AI model name wrong — check `openai-gpt-54` is correct
- CUSDC mint fails — owner may not have minter role
- Subgraph URL changed — check codegen.ts for current URL
