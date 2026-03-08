/**
 * create-events.ts — Automated prediction market event generator
 *
 * Cron-friendly script that:
 *   1. Fetches existing events from subgraph (deduplication)
 *   2. Asks Venice AI to suggest 1-3 new prediction market questions
 *   3. Creates events on ExamplePredictionMarket
 *   4. Places 3-5 random bets per event from test accounts (fire-and-forget)
 *
 * Env vars required:
 *   OWNER_PK                  — creates events, mints CUSDC
 *   TEST_ACCOUNT_1..25        — private keys for bet-placing accounts
 *   RPC_URL                   — Eth Sepolia RPC
 *   VENICE_API_KEY            — Venice AI API key
 *
 * Optional:
 *   ENABLE_NTFY=true          — send notifications via ntfy
 *   NTFY_HOST                 — ntfy server URL (default: http://localhost:8090)
 *   NTFY_TOPIC                — ntfy topic (default: event-creator)
 *   NTFY_USER                 — user tag in notifications (default: unknown)
 *
 * Usage: pnpm create-events
 */

import "dotenv/config";

import {
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  confidentialUsdcAbi,
  examplePredictionMarketAbi,
} from "@private-streams/common";
import { GraphQLClient } from "graphql-request";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
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

const SUBGRAPH_URL = process.env.SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/1743303/insider-streams-2/version/latest";

const USDC_DECIMALS = 6;
// Balance threshold: if below 1,000 CUSDC, mint more (reads first — writes are expensive)
const MIN_BALANCE = 1_000_000_000n; // 1,000 CUSDC
const MINT_AMOUNT = 10_000_000_000n; // 10,000 CUSDC per mint
// Approve uint256 max so we never need to re-approve
const APPROVAL_AMOUNT =
  115_792_089_237_316_195_423_570_985_008_687_907_853_269_984_665_640_564_039_457_584_007_913_129_639_935n;
// Re-approve when allowance drops below 1,000 CUSDC
const MIN_ALLOWANCE = 1_000_000_000n;

const DURATIONS = [1800n, 3600n]; // 30 min or 1 hour
const MIN_BET_USDC = 10; // $10
const MAX_BET_USDC = 500; // $500
const MIN_BETS_PER_EVENT = 3;
const MAX_BETS_PER_EVENT = 5;
const BET_PAUSE_MS = 5_000; // 5s pause between bets
const NUM_EVENTS_TO_GENERATE =
  Math.floor(Math.random() * 3) + 1; // 1–3 events per run

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

// ─── ntfy (optional) ─────────────────────────────────────────────────────────

const ENABLE_NTFY = process.env.ENABLE_NTFY === "true";
const NTFY_HOST = process.env.NTFY_HOST ?? "http://localhost:8090";
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "event-creator-script";
const NTFY_USER = process.env.NTFY_USER ?? "UNKNOWN";

async function ntfy(
  title: string,
  message: string,
  tags?: string[],
) {
  if (!ENABLE_NTFY) return;
  try {
    await fetch(`${NTFY_HOST}/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        Title: title,
        ...(tags?.length ? { Tags: tags.join(",") } : {}),
      },
      body: `[${NTFY_USER}] ${message}`,
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error(`  [ntfy] Failed to send notification: ${err}`);
  }
}

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

// Read the actual payment token from the deployed contract so we always
// mint/approve the right token regardless of what's in common's consts.
const paymentTokenAddress = await publicClient.readContract({
  address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
  abi: examplePredictionMarketAbi,
  functionName: "paymentToken",
}) as Address;
console.log(`  Payment token: ${paymentTokenAddress}`);

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
    address: paymentTokenAddress,
    abi: confidentialUsdcAbi,
    functionName: "balanceOf",
    args: [target],
  })) as bigint;

  if (balance < MIN_BALANCE) {
    const h = await ownerClient.writeContract({
      address: paymentTokenAddress,
      abi: confidentialUsdcAbi,
      functionName: "mint",
      args: [target, MINT_AMOUNT],
    });
    await waitForTx(
      h,
      `Mint ${formatUnits(MINT_AMOUNT, USDC_DECIMALS)} CUSDC to ${target.slice(0, 8)}...`,
    );
    // Brief pause after mint so node state propagates before next read/write
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

async function ensureApproval(
  walletClient: typeof ownerClient,
  owner: Address,
) {
  const allowance = (await publicClient.readContract({
    address: paymentTokenAddress,
    abi: confidentialUsdcAbi,
    functionName: "allowance",
    args: [owner, EXAMPLE_PREDICTION_MARKET_ADDRESS],
  })) as bigint;

  if (allowance < MIN_ALLOWANCE) {
    const h = await walletClient.writeContract({
      address: paymentTokenAddress,
      abi: confidentialUsdcAbi,
      functionName: "approve",
      args: [EXAMPLE_PREDICTION_MARKET_ADDRESS, APPROVAL_AMOUNT],
    });
    await waitForTx(h, `Approval for ${owner.slice(0, 8)}...`);
    // Brief pause after approval so node state propagates before next read/write
    await new Promise((resolve) => setTimeout(resolve, 2_000));
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
      question: z
        .string()
        .describe(
          "The prediction market question, phrased as a future-tense question",
        ),
    }),
  ),
});

async function generateEventQuestions(
  existingQuestions: string[],
): Promise<string[]> {
  const existingList =
    existingQuestions.length > 0
      ? `\n\nEXISTING MARKETS (do NOT duplicate these):\n${existingQuestions.map((q) => `- ${q}`).join("\n")}`
      : "";

  const systemPrompt = `You are a prediction market event creator. You suggest prediction market questions based on REAL past events that have KNOWN outcomes. The events must be real and verifiable — things like past Super Bowl winners, Oscar winners, election results, sports championships, major tech acquisitions, etc.

CRITICAL RULES:
1. Each question must be phrased as if the outcome is UNKNOWN — use future tense ("Will X happen?") even though the event already occurred. This is for a prediction market demo.
2. The outcomes must be easily verifiable by an AI with web search access.
3. Keep questions concise (under 150 characters).
4. Cover diverse topics: sports, entertainment, politics, science, tech, business.
5. Do NOT repeat any existing market questions.`;

  const userPrompt = `Suggest ${NUM_EVENTS_TO_GENERATE} prediction market questions based on real past events with known outcomes.${existingList}`;

  // Try structured output first (zodResponseFormat), fall back to json_object mode
  try {
    const response = await venice.chat.completions.parse({
      model: "openai-gpt-54",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: zodResponseFormat(
        EventSuggestionSchema,
        "event_suggestions",
      ),
      temperature: 1.0,
    });

    const parsed = response.choices[0]?.message?.parsed;
    if (parsed) {
      return parsed.events.map((e) => e.question);
    }

    // If parsed is null, fall through to manual parsing of content
    const content = response.choices[0]?.message?.content;
    if (content) {
      const manual = EventSuggestionSchema.parse(JSON.parse(content));
      return manual.events.map((e: { question: string }) => e.question);
    }

    throw new Error("Venice AI returned empty response");
  } catch (err) {
    // If structured output isn't supported, fall back to json_object mode
    if (
      err instanceof Error &&
      (err.message.includes("response_format") ||
        err.message.includes("json_schema") ||
        err.message.includes("400"))
    ) {
      console.log(
        "  Structured output not supported, falling back to json_object mode...",
      );
      const response = await venice.chat.completions.create({
        model: "openai-gpt-54",
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\n\nRespond with a JSON object containing an "events" array with exactly ${NUM_EVENTS_TO_GENERATE} event objects, each with a "question" field.\n\nExample format:\n{"events": [{"question": "Will the Kansas City Chiefs win Super Bowl LVIII?"}]}`,
          },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 1.0,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Venice AI returned empty response");
      }

      const parsed = EventSuggestionSchema.parse(JSON.parse(content));
      return parsed.events.map((e) => e.question);
    }
    throw err;
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    "\n╔══════════════════════════════════════════════════════╗",
  );
  console.log(
    "║  Create Prediction Market Events                     ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════╝",
  );
  console.log(`  Owner:     ${ownerAccount.address}`);
  console.log(`  Market:    ${EXAMPLE_PREDICTION_MARKET_ADDRESS}`);
  console.log(`  CUSDC:     ${paymentTokenAddress}`);
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
      console.error(
        `  x Failed to create event: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  if (createdEvents.length === 0) {
    console.error("\nNo events were created. Exiting.");
    await ntfy("Event Creator Failed", "No events were created — all newEvent calls failed.", ["rotating_light"]);
    process.exit(1);
  }

  // ── Step 5: Place random bets (fire-and-forget) ──────────────────────────
  console.log("\n━━━ Step 5: Placing random bets ━━━");

  for (const { eventId, question } of createdEvents) {
    const numBets = randomInt(MIN_BETS_PER_EVENT, MAX_BETS_PER_EVENT);
    const selectedAccounts = pickRandom(testAccounts, numBets);
    console.log(
      `\n  Event ${eventId}: "${question.slice(0, 60)}..." — ${selectedAccounts.length} bets`,
    );

    for (const { key, label } of selectedAccounts) {
      const account = privateKeyToAccount(key);
      const betAmount =
        BigInt(randomInt(MIN_BET_USDC, MAX_BET_USDC)) * 1_000_000n; // to 6 decimals
      const outcome = OUTCOMES[randomInt(0, 1)]!;
      const outcomeLabel = outcome === 2 ? "YES" : "NO";

      try {
        // Ensure balance and approval (reads first — writes are expensive)
        await ensureBalance(account.address);
        const betterClient = createWalletClient({
          account,
          chain: sepolia,
          transport: http(RPC_URL),
        });
        await ensureApproval(betterClient, account.address);

        // Place bet — fire-and-forget, don't wait for receipt
        const hash = await betterClient.writeContract({
          address: EXAMPLE_PREDICTION_MARKET_ADDRESS,
          abi: examplePredictionMarketAbi,
          functionName: "buyShares",
          args: [eventId, outcome, betAmount],
        });
        console.log(
          `  >> ${label} bet $${formatUnits(betAmount, USDC_DECIMALS)} ${outcomeLabel} (tx: ${hash.slice(0, 10)}...)`,
        );
      } catch (err) {
        console.error(
          `  x ${label} bet failed: ${err instanceof Error ? err.message : err}`,
        );
      }

      // Pause between bets
      await new Promise((resolve) => setTimeout(resolve, BET_PAUSE_MS));
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(
    "\n╔══════════════════════════════════════════════════════╗",
  );
  console.log(
    "║  Done                                                ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════╝",
  );
  console.log(`  Created ${createdEvents.length} events:`);
  createdEvents.forEach(({ eventId, question }) =>
    console.log(`    Event ${eventId}: ${question}`),
  );

  const summary = createdEvents
    .map(({ eventId, question }) => `#${eventId}: ${question}`)
    .join("\n");
  await ntfy(
    `Created ${createdEvents.length} events`,
    summary,
    ["chart_with_upwards_trend"],
  );
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("\nx create-events failed:", err);
    await ntfy(
      "Event Creator Crashed",
      err instanceof Error ? err.message : String(err),
      ["rotating_light"],
    );
    process.exit(1);
  });
