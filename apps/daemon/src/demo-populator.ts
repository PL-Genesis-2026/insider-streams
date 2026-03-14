/**
 * Demo Populator — Background service that continuously populates the marketplace
 * with prediction events, auctions, bids, and settlement requests.
 *
 * Opt-in via DEMO_MODE=true in .env.
 *
 * Intervals:
 *   - create-events:       every 15 minutes
 *   - spawn-auctions:      every 5 minutes
 *   - place-bids:          every 1 minute
 *   - request-settlements: every 10 minutes
 *
 * Requires:
 *   VENICE_API_KEY        — Venice AI for event question generation
 *   TEST_ACCOUNT_1..25    — private keys for test accounts
 */

import {
  CREATE_AUCTION_DURATION_SECONDS,
  type CreateAuctionDuration,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  MOCK_USDC_ADDRESS,
  examplePredictionMarketAbi,
  mockUsdcAbi,
} from "@private-streams/common";
import { GraphQLClient, gql } from "graphql-request";
import { createHash, randomBytes } from "node:crypto";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  createWalletClient,
  formatUnits,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { z } from "zod";

import { withAdminLock } from "./admin-lock.js";
import { config } from "./config.js";
import { encryptWithKek } from "./crypto.js";
import { getOrCreateUser, insertSecret, insertSecretWithFilecoin, recordBid } from "./db.js";
import { isFilecoinConfigured, uploadEncryptedToFilecoin } from "./filecoin.js";
import * as marketplace from "./marketplace.js";
import { sendNotification } from "./notify.js";
import { getAccount, getPublicClient, getWalletClient, waitForReceipt } from "./provider.js";

// ─── Intervals ──────────────────────────────────────────────────────────────

const CREATE_EVENTS_INTERVAL_MS = 10 * 60 * 1000; // 15 minutes
const SPAWN_AUCTIONS_INTERVAL_MS = 1 * 60 * 1000; // 1 minute
const PLACE_BIDS_INTERVAL_MS = 1 * 60 * 1000; // 1 minute
const REQUEST_SETTLEMENTS_INTERVAL_MS = 1 * 60 * 1000; // 10 minutes

// ─── Constants ──────────────────────────────────────────────────────────────

const USDC_DECIMALS = 6;
const MIN_BALANCE = 1_000_000_000n; // 1,000 USDC
const MINT_AMOUNT = 10_000_000_000n; // 10,000 USDC per mint
const APPROVAL_AMOUNT = 2n ** 256n - 1n; // uint256 max
const MIN_ALLOWANCE = 1_000_000_000n;

const EVENT_DURATIONS = [1800n, 3600n, 10800n]; // 30 min, 1 hour, or 3 hours
const MIN_BET_USDC = 10;
const MAX_BET_USDC = 500;
const MIN_BETS_PER_EVENT = 3;
const MAX_BETS_PER_EVENT = 5;
const BET_PAUSE_MS = 5_000;

const AUCTION_DURATIONS: CreateAuctionDuration[] = ["5m", "15m", "30m", "1h"];
const SECRET_POOL = [
  "YES",
  "NO",
  "The answer is YES.",
  "The answer is NO.",
  "Prediction: YES",
  "Prediction: NO",
];

// Output format weights for AI-researched secrets
type SecretFormat = "text" | "txt" | "md" | "json";
const SECRET_FORMATS: { format: SecretFormat; weight: number }[] = [
  { format: "text", weight: 30 },
  { format: "txt", weight: 30 },
  { format: "md", weight: 20 },
  { format: "json", weight: 20 },
];

function pickWeightedFormat(): SecretFormat {
  const total = SECRET_FORMATS.reduce((sum, f) => sum + f.weight, 0);
  let r = Math.random() * total;
  for (const { format, weight } of SECRET_FORMATS) {
    r -= weight;
    if (r <= 0) return format;
  }
  return "text";
}

const ResearchAnswerSchema = z.object({
  prediction: z.enum(["yes", "no"]),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  sources: z.array(z.string()).optional(),
});

async function researchEventAnswer(
  venice: OpenAI,
  question: string,
): Promise<{ prediction: boolean; content: string; format: SecretFormat }> {
  const format = pickWeightedFormat();

  const systemPrompt = `You are a research assistant that determines the actual outcome of past events phrased as prediction market questions. Search the web for the answer.

Respond with a JSON object containing:
- "prediction": "yes" or "no" — the actual outcome
- "confidence": 0-100 — your confidence level
- "reasoning": a detailed explanation with citations and source URLs
- "sources": array of source URLs

The events are phrased in future tense but they already happened. Determine what actually occurred.`;

  try {
    const response = await venice.chat.completions.create({
      model: "openai-gpt-54",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `What is the actual outcome of: "${question}"` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");

    const parsed = ResearchAnswerSchema.parse(JSON.parse(raw));
    const prediction = parsed.prediction === "yes";

    let content: string;
    switch (format) {
      case "json":
        content = JSON.stringify(parsed, null, 2);
        break;
      case "md":
        content = `# Research: ${question}\n\n## Prediction: ${parsed.prediction.toUpperCase()}\n\n**Confidence:** ${parsed.confidence}%\n\n## Reasoning\n\n${parsed.reasoning}\n\n## Sources\n\n${(parsed.sources ?? []).map((s) => `- ${s}`).join("\n") || "No sources cited."}`;
        break;
      default:
        content = `Prediction: ${parsed.prediction.toUpperCase()}\nConfidence: ${parsed.confidence}%\n\n${parsed.reasoning}${parsed.sources?.length ? "\n\nSources:\n" + parsed.sources.join("\n") : ""}`;
        break;
    }

    return { prediction, content, format };
  } catch (err) {
    // Fallback: random prediction with simple text
    console.warn(`[demo]   AI research failed: ${err instanceof Error ? err.message : err}`);
    const prediction = Math.random() > 0.5;
    return {
      prediction,
      content: prediction ? "The answer is YES." : "The answer is NO.",
      format: "text",
    };
  }
}

const BID_MIN_INCREMENT = 10_000_000n; // 10 USDC
const BID_MAX_INCREMENT = 50_000_000n; // 50 USDC
const BID_LOW_BALANCE = 100_000_000n; // 100 USDC
const BID_DEPOSIT_AMOUNT = 1_000_000_000n; // 1,000 USDC

const OUTCOMES = [1, 2] as const; // 1=No, 2=Yes

// ─── Test Accounts ──────────────────────────────────────────────────────────

interface TestAccount {
  privateKey: Hex;
  address: Address;
  account: PrivateKeyAccount;
  label: string;
}

function loadTestAccounts(): TestAccount[] {
  const accounts: TestAccount[] = [];
  for (let i = 1; i <= 25; i++) {
    const raw = process.env[`TEST_ACCOUNT_${i}`];
    if (!raw) continue;
    // Strip trailing comments (e.g. "0xabc123 # 0xAddress")
    const pk = raw.split("#")[0]!.split(" ")[0]!.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(pk)) {
      console.warn(`[demo] TEST_ACCOUNT_${i} is invalid, skipping`);
      continue;
    }
    const account = privateKeyToAccount(pk as Hex);
    accounts.push({
      privateKey: pk as Hex,
      address: account.address,
      account,
      label: `TEST_ACCOUNT_${i}`,
    });
  }
  return accounts;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickRandomN<T>(arr: readonly T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function timestamp(): number {
  return Math.floor(Date.now() / 1000);
}

async function waitForTx(hash: Hex, label: string) {
  const receipt = await waitForReceipt(hash);
  if (receipt.status !== "success") throw new Error(`${label} tx failed`);
  console.log(`[demo]   ok ${label} (tx: ${hash.slice(0, 10)}...)`);
  return receipt;
}

// ─── Venice AI ──────────────────────────────────────────────────────────────

const EventSuggestionSchema = z.object({
  events: z.array(
    z.object({
      question: z
        .string()
        .describe("A prediction market question in future tense"),
    }),
  ),
});

async function generateEventQuestions(
  venice: OpenAI,
  existingQuestions: string[],
  count: number,
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

  const userPrompt = `Suggest ${count} prediction market questions based on real past events with known outcomes.${existingList}`;

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
    if (parsed) return parsed.events.map((e) => e.question);

    const content = response.choices[0]?.message?.content;
    if (content) {
      const manual = EventSuggestionSchema.parse(JSON.parse(content));
      return manual.events.map((e) => e.question);
    }
    throw new Error("Venice AI returned empty response");
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("response_format") ||
        err.message.includes("json_schema") ||
        err.message.includes("400"))
    ) {
      console.log(
        "[demo]   Structured output not supported, falling back to json_object mode...",
      );
      const response = await venice.chat.completions.create({
        model: "openai-gpt-54",
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\n\nRespond with a JSON object containing an "events" array with exactly ${count} event objects, each with a "question" field.\n\nExample format:\n{"events": [{"question": "Will the Kansas City Chiefs win Super Bowl LVIII?"}]}`,
          },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 1.0,
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("Venice AI returned empty response");
      const parsed = EventSuggestionSchema.parse(JSON.parse(content));
      return parsed.events.map((e) => e.question);
    }
    throw err;
  }
}

// ─── Subgraph Queries ───────────────────────────────────────────────────────

const EXISTING_EVENTS_QUERY = gql`
  query ExistingEvents($limit: Int!) {
    eventCreateds(
      first: $limit
      orderBy: blockTimestamp
      orderDirection: desc
    ) {
      eventId
      question
    }
  }
`;

const OPEN_EVENTS_QUERY = gql`
  {
    eventCreateds(first: 100, orderBy: blockTimestamp, orderDirection: desc) {
      eventId
      question
    }
    settlementResponses(first: 1000) {
      eventId
    }
  }
`;

const OPEN_AUCTIONS_QUERY = gql`
  query OpenAuctions($now: BigInt!) {
    auctionCreateds(
      where: { endTime_gt: $now }
      first: 100
      orderBy: endTime
      orderDirection: asc
    ) {
      auctionId
      sellerId
      endTime
    }
  }
`;

const CLOSED_UNSETTLED_QUERY = gql`
  query ClosedUnsettledEvents($now: BigInt!) {
    eventCreateds(
      where: { eventClose_lt: $now }
      first: 1000
      orderBy: eventClose
      orderDirection: desc
    ) {
      eventId
      question
      eventClose
    }
    settlementRequesteds(first: 1000) {
      eventId
    }
    settlementResponses(first: 1000) {
      eventId
    }
  }
`;

// ─── Cycle: Create Events ───────────────────────────────────────────────────

async function runCreateEvents(
  venice: OpenAI,
  gqlClient: GraphQLClient,
  testAccounts: TestAccount[],
): Promise<void> {
  console.log("[demo] ── create-events cycle ──");

  const publicClient = getPublicClient();
  const adminClient = getWalletClient();
  const adminAddress = getAccount().address;

  // Read payment token from contract
  const paymentToken = (await publicClient.readContract({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
    abi: examplePredictionMarketAbi,
    functionName: "paymentToken",
  })) as Address;

  // Step 1: Fetch existing events
  const { eventCreateds } = await gqlClient.request<{
    eventCreateds: { eventId: string; question: string }[];
  }>(EXISTING_EVENTS_QUERY, { limit: 50 });
  const existingQuestions = eventCreateds.map((e) => e.question);
  console.log(`[demo]   ${existingQuestions.length} existing events`);

  // Step 2: Generate new questions via Venice AI
  const count = randomInt(1, 3);
  const questions = await generateEventQuestions(
    venice,
    existingQuestions,
    count,
  );
  console.log(`[demo]   Generated ${questions.length} new questions`);

  // Step 3: Ensure admin has USDC
  const adminBalance = (await publicClient.readContract({
    address: paymentToken,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: [adminAddress],
  })) as bigint;
  if (adminBalance < MIN_BALANCE) {
    const h = await withAdminLock(() =>
      adminClient.writeContract({
        address: paymentToken,
        abi: mockUsdcAbi,
        functionName: "mint",
        args: [adminAddress, MINT_AMOUNT],
      }),
    );
    await waitForTx(h, "Mint USDC for admin");
  }

  // Ensure approval
  const allowance = (await publicClient.readContract({
    address: paymentToken,
    abi: mockUsdcAbi,
    functionName: "allowance",
    args: [adminAddress, EXAMPLE_PREDICTION_MARKET_ADDRESS as Address],
  })) as bigint;
  if (allowance < MIN_ALLOWANCE) {
    const h = await withAdminLock(() =>
      adminClient.writeContract({
        address: paymentToken,
        abi: mockUsdcAbi,
        functionName: "approve",
        args: [EXAMPLE_PREDICTION_MARKET_ADDRESS as Address, APPROVAL_AMOUNT],
      }),
    );
    await waitForTx(h, "Approve USDC for admin");
  }

  // Step 4: Create events on-chain
  const createdEvents: { eventId: bigint; question: string }[] = [];
  for (const question of questions) {
    const duration = EVENT_DURATIONS[randomInt(0, EVENT_DURATIONS.length - 1)]!;
    try {
      const hash = await withAdminLock(() =>
        adminClient.writeContract({
          address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
          abi: examplePredictionMarketAbi,
          functionName: "newEvent",
          args: [question, duration],
        }),
      );
      const receipt = await waitForTx(hash, `Event: "${question.slice(0, 40)}..."`);
      const logs = parseEventLogs({
        abi: examplePredictionMarketAbi,
        logs: receipt.logs,
        eventName: "EventCreated",
      });
      const eventId = (logs[0] as { args: { eventId: bigint } }).args.eventId;
      createdEvents.push({ eventId, question });
    } catch (err) {
      console.error(
        `[demo]   Failed to create event: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  if (createdEvents.length === 0) {
    console.log("[demo]   No events created this cycle");
    return;
  }

  // Step 5: Place random bets from test accounts
  for (const { eventId, question } of createdEvents) {
    const numBets = randomInt(MIN_BETS_PER_EVENT, MAX_BETS_PER_EVENT);
    const selected = pickRandomN(testAccounts, numBets);

    for (const ta of selected) {
      const betAmount =
        BigInt(randomInt(MIN_BET_USDC, MAX_BET_USDC)) * 1_000_000n;
      const outcome = pickRandom(OUTCOMES);

      try {
        // Ensure test account has USDC
        const bal = (await publicClient.readContract({
          address: paymentToken,
          abi: mockUsdcAbi,
          functionName: "balanceOf",
          args: [ta.address],
        })) as bigint;
        if (bal < MIN_BALANCE) {
          const h = await withAdminLock(() =>
            adminClient.writeContract({
              address: paymentToken,
              abi: mockUsdcAbi,
              functionName: "mint",
              args: [ta.address, MINT_AMOUNT],
            }),
          );
          await waitForTx(h, `Mint for ${ta.label}`);
          await new Promise((r) => setTimeout(r, 2_000));
        }

        // Ensure approval
        const betClient = createWalletClient({
          account: ta.account,
          chain: sepolia,
          transport: http(config.rpcUrl),
        });
        const all = (await publicClient.readContract({
          address: paymentToken,
          abi: mockUsdcAbi,
          functionName: "allowance",
          args: [ta.address, EXAMPLE_PREDICTION_MARKET_ADDRESS as Address],
        })) as bigint;
        if (all < MIN_ALLOWANCE) {
          const h = await betClient.writeContract({
            address: paymentToken,
            abi: mockUsdcAbi,
            functionName: "approve",
            args: [
              EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
              APPROVAL_AMOUNT,
            ],
          });
          await waitForTx(h, `Approve for ${ta.label}`);
          await new Promise((r) => setTimeout(r, 2_000));
        }

        // Place bet (fire-and-forget receipt)
        const hash = await betClient.writeContract({
          address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
          abi: examplePredictionMarketAbi,
          functionName: "buyShares",
          args: [eventId, outcome, betAmount],
        });
        console.log(
          `[demo]   ${ta.label} bet $${formatUnits(betAmount, USDC_DECIMALS)} ${outcome === 2 ? "YES" : "NO"} on event ${eventId} (tx: ${hash.slice(0, 10)}...)`,
        );
      } catch (err) {
        console.error(
          `[demo]   ${ta.label} bet failed: ${err instanceof Error ? err.message : err}`,
        );
      }

      await new Promise((r) => setTimeout(r, BET_PAUSE_MS));
    }
  }

  const summary = createdEvents
    .map((e) => `#${e.eventId}: ${e.question}`)
    .join("\n");
  await sendNotification(`Created ${createdEvents.length} events`, summary, undefined, config.ntfyTopicCreateEvents);
  console.log(`[demo]   Created ${createdEvents.length} events`);
}

// ─── Cycle: Spawn Auctions ─────────────────────────────────────────────────

async function runSpawnAuctions(
  venice: OpenAI,
  gqlClient: GraphQLClient,
  testAccounts: TestAccount[],
): Promise<void> {
  console.log("[demo] ── spawn-auctions cycle ──");

  // Query subgraph for open events (exclude settled)
  const data = await gqlClient.request<{
    eventCreateds: { eventId: string; question: string }[];
    settlementResponses: { eventId: string }[];
  }>(OPEN_EVENTS_QUERY);

  const settledIds = new Set(data.settlementResponses.map((r) => r.eventId));
  const openEvents = data.eventCreateds.filter(
    (e) => !settledIds.has(e.eventId),
  );

  if (openEvents.length === 0) {
    console.log("[demo]   No open events, skipping");
    return;
  }

  const candidates = shuffle(openEvents);
  const ta = pickRandom(testAccounts);
  const user = getOrCreateUser(ta.address);

  for (const event of candidates) {
    console.log(
      `[demo]   Trying event ${event.eventId} — "${event.question.slice(0, 50)}..."`,
    );

    // Research the actual answer using AI
    const research = await researchEventAnswer(venice, event.question);
    const { prediction, content: secretContent, format } = research;

    const duration = pickRandom(AUCTION_DURATIONS);
    const durationSecs = CREATE_AUCTION_DURATION_SECONDS[duration]!;
    const endTime = timestamp() + durationSecs;

    // Generate secretDataCid and key from content
    const keyBytes = randomBytes(32);
    const secretDataKey = BigInt("0x" + keyBytes.toString("hex"));
    const secretDataCid =
      "0x" + createHash("sha256").update(secretContent).digest("hex");

    console.log(
      `[demo]   Signer: ${ta.address.slice(0, 10)}..., format: ${format}, prediction: ${prediction ? "YES" : "NO"}, duration: ${duration}`,
    );

    try {
      // Determine if we should upload to Filecoin (file-based formats when configured)
      const useFilecoin = isFilecoinConfigured() && (format === "txt" || format === "md" || format === "json");

      if (useFilecoin) {
        const ext = format === "txt" ? ".txt" : format === "md" ? ".md" : ".json";
        const mimeType = format === "json" ? "application/json" : "text/plain";
        const fileName = `research${ext}`;
        const textBuffer = Buffer.from(secretContent, "utf8");

        try {
          const metadata = await uploadEncryptedToFilecoin(textBuffer, fileName, mimeType);

          const { txHash, auctionId } = await marketplace.createAuction(
            user.userId,
            Number(event.eventId),
            event.question,
            endTime,
            prediction,
            secretDataCid,
            secretDataKey,
          );

          const eventDataJson = JSON.stringify({
            marketplace: "insider-streams",
            event: event.question,
            marketId: Number(event.eventId),
            outcome: prediction ? "yes" : "no",
          });

          insertSecretWithFilecoin(
            auctionId,
            user.userId,
            secretDataCid,
            "0x" + keyBytes.toString("hex"),
            secretContent,
            eventDataJson,
            {
              pieceCid: metadata.pieceCid,
              retrievalUrl: metadata.retrievalUrl,
              copiesJson: JSON.stringify(metadata.copies),
              fileName,
              contentType: mimeType,
              fileSizeBytes: textBuffer.byteLength,
              encryptedFileSizeBytes: Number(metadata.encryptedFileSizeBytes),
              encryptedSecretKey: encryptWithKek(metadata.encryptionKey),
              encryptionAlgorithm: metadata.encryptionAlgorithm,
              encryptedFileName: `${fileName}.enc`,
              fileMd5: metadata.fileMd5,
            },
          );

          console.log(
            `[demo]   Auction ${auctionId} created with Filecoin attachment (tx: ${txHash.slice(0, 10)}...)`,
          );
          await sendNotification(
            "Auction Created (Filecoin)",
            `Auction ${auctionId} (${duration}) for event ${event.eventId}\n"${event.question}"\nFormat: ${format}, CID: ${metadata.pieceCid.slice(0, 20)}...`,
          );
          return;
        } catch (filecoinErr) {
          console.warn(`[demo]   Filecoin upload failed, falling back to text: ${filecoinErr instanceof Error ? filecoinErr.message : filecoinErr}`);
          // Fall through to text path
        }
      }

      // Text-only path (no Filecoin or fallback)
      const { txHash, auctionId } = await marketplace.createAuction(
        user.userId,
        Number(event.eventId),
        event.question,
        endTime,
        prediction,
        secretDataCid,
        secretDataKey,
      );

      const eventDataJson = JSON.stringify({
        marketplace: "insider-streams",
        event: event.question,
        marketId: Number(event.eventId),
        outcome: prediction ? "yes" : "no",
      });
      insertSecret(
        auctionId,
        user.userId,
        secretDataCid,
        "0x" + keyBytes.toString("hex"),
        secretContent,
        eventDataJson,
      );

      console.log(
        `[demo]   Auction ${auctionId} created (tx: ${txHash.slice(0, 10)}...)`,
      );
      await sendNotification(
        "Auction Created",
        `Auction ${auctionId} (${duration}) for event ${event.eventId}\n"${event.question}"`,
        undefined,
        config.ntfyTopicSpawnAuctions,
      );
      return; // One auction per cycle
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Skip event-level errors, try next
      if (
        msg.includes("Event not open") ||
        msg.includes("Event not found") ||
        msg.includes("expired")
      ) {
        console.log(
          `[demo]   Event ${event.eventId} not eligible, trying next`,
        );
        continue;
      }
      console.error(`[demo]   Auction creation failed: ${msg}`);
      return;
    }
  }

  console.log("[demo]   All events skipped, nothing created this cycle");
}

// ─── Cycle: Place Bids ──────────────────────────────────────────────────────

async function runPlaceBids(
  gqlClient: GraphQLClient,
  testAccounts: TestAccount[],
): Promise<void> {
  console.log("[demo] ── place-bids cycle ──");

  const now = timestamp().toString();
  const data = await gqlClient.request<{
    auctionCreateds: { auctionId: string; sellerId: string; endTime: string }[];
  }>(OPEN_AUCTIONS_QUERY, { now });

  const auctions = data.auctionCreateds;
  if (auctions.length === 0) {
    console.log("[demo]   No open auctions");
    return;
  }

  console.log(`[demo]   ${auctions.length} open auction(s)`);

  let bidsPlaced = 0;

  for (const auction of shuffle(auctions)) {
    const ta = pickRandom(testAccounts);
    const user = getOrCreateUser(ta.address);

    try {
      const auctionIdNum = Number(auction.auctionId);

      // Read current bid state from on-chain (source of truth)
      let currentBidPlaintext = 0n;
      let previousBidderId = "";
      try {
        const mp = marketplace.getMarketplace();
        const auctionData = await mp.read.getAuction([BigInt(auctionIdNum)]);
        currentBidPlaintext = BigInt(auctionData[9]); // currentBidPlaintext (uint64)
        previousBidderId = auctionData[3] || ""; // currentBidderId
      } catch {
        // Auction may not exist or read failed — use defaults
      }

      // Bid = current highest + random increment (always exceeds current)
      const range = BID_MAX_INCREMENT - BID_MIN_INCREMENT;
      const increment =
        BID_MIN_INCREMENT + BigInt(Math.floor(Math.random() * Number(range)));
      const bidAmount = currentBidPlaintext + increment;

      // Check balance — use on-chain decrypt
      let balance: bigint;
      try {
        balance = await marketplace.getOnChainBalance(user.userId);
      } catch {
        balance = 0n;
      }

      if (balance < bidAmount) {
        // Top up: mint MockUSDC to admin, then deposit for user
        console.log(
          `[demo]   ${ta.label} balance ${balance} < bid ${bidAmount}, topping up`,
        );
        try {
          const mintHash = await withAdminLock(() =>
            getWalletClient().writeContract({
              address: MOCK_USDC_ADDRESS as Address,
              abi: mockUsdcAbi,
              functionName: "mint",
              args: [getAccount().address, BID_DEPOSIT_AMOUNT],
            }),
          );
          await waitForTx(mintHash, `Mint USDC for ${ta.label}`);

          await marketplace.depositFor(user.userId, BID_DEPOSIT_AMOUNT);
          balance += BID_DEPOSIT_AMOUNT;
        } catch (err) {
          console.warn(
            `[demo]   Top-up failed for ${ta.label}: ${err instanceof Error ? err.message : err}`,
          );
          continue;
        }
      }

      if (balance < bidAmount) {
        console.log(
          `[demo]   Skipping auction ${auction.auctionId} — balance ${balance} still < bid ${bidAmount}`,
        );
        continue;
      }

      console.log(
        `[demo]   Bidding ${formatUnits(bidAmount, USDC_DECIMALS)} USDC on auction ${auction.auctionId} from ${ta.label}`,
      );

      // Record bid in SQLite
      const bid = recordBid(auctionIdNum, user.userId, bidAmount.toString());

      // Submit on-chain — await to avoid nonce collisions from parallel admin txs
      try {
        const txHash = await marketplace.placeBid(
          auctionIdNum,
          user.userId,
          previousBidderId,
          bidAmount,
        );
        console.log(
          `[demo]   Bid ${bid.id} confirmed (tx: ${txHash.slice(0, 10)}...)`,
        );
      } catch (err) {
        console.error(
          `[demo]   Bid ${bid.id} failed: ${err instanceof Error ? err.message : err}`,
        );
      }

      bidsPlaced++;
    } catch (err) {
      console.error(
        `[demo]   Error on auction ${auction.auctionId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  if (bidsPlaced > 0) {
    await sendNotification(
      "Bids Placed",
      `Placed ${bidsPlaced} bid(s) across ${auctions.length} auction(s)`,
      undefined,
      config.ntfyTopicPlaceBids,
    );
  }
  console.log(`[demo]   Placed ${bidsPlaced} bid(s)`);
}

// ─── Cycle: Request Settlements ─────────────────────────────────────────────

async function runRequestSettlements(gqlClient: GraphQLClient): Promise<void> {
  console.log("[demo] ── request-settlements cycle ──");

  const now = timestamp().toString();
  const data = await gqlClient.request<{
    eventCreateds: { eventId: string; question: string; eventClose: string }[];
    settlementRequesteds: { eventId: string }[];
    settlementResponses: { eventId: string }[];
  }>(CLOSED_UNSETTLED_QUERY, { now });

  const requestedIds = new Set(data.settlementRequesteds.map((r) => r.eventId));
  const settledIds = new Set(data.settlementResponses.map((r) => r.eventId));
  const toSettle = data.eventCreateds.filter(
    (e) => !requestedIds.has(e.eventId) && !settledIds.has(e.eventId),
  );

  if (toSettle.length === 0) {
    console.log("[demo]   No closed-but-unsettled events");
    return;
  }

  console.log(`[demo]   ${toSettle.length} event(s) to settle`);

  const walletClient = getWalletClient();
  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const event of toSettle) {
    try {
      console.log(`[demo]   Requesting settlement for event ${event.eventId}`);
      const hash = await withAdminLock(() =>
        walletClient.writeContract({
          address: EXAMPLE_PREDICTION_MARKET_ADDRESS as `0x${string}`,
          abi: examplePredictionMarketAbi,
          functionName: "requestSettlement",
          args: [BigInt(event.eventId)],
        }),
      );
      await waitForReceipt(hash);
      console.log(`[demo]   Event ${event.eventId}: confirmed`);
      succeeded.push(event.eventId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("StatusNotOpen")) {
        console.log(`[demo]   Event ${event.eventId}: already settled, skipping`);
      } else {
        console.error(`[demo]   Event ${event.eventId}: FAILED — ${msg}`);
        failed.push(event.eventId);
      }
    }
  }

  const lines: string[] = [];
  if (succeeded.length > 0) lines.push(`Settled: [${succeeded.join(", ")}]`);
  if (failed.length > 0) lines.push(`Failed: [${failed.join(", ")}]`);
  if (lines.length > 0) await sendNotification("Settlements Requested", lines.join("\n"), undefined, config.ntfyTopicSettlements);
}

// ─── Entry Point ────────────────────────────────────────────────────────────

export async function startDemoPopulator(): Promise<void> {
  if (!config.demoMode) return;

  const testAccounts = loadTestAccounts();
  if (testAccounts.length === 0) {
    console.error(
      "[demo] No TEST_ACCOUNT_* keys found — demo populator disabled",
    );
    return;
  }

  if (!config.veniceApiKey) {
    console.error("[demo] VENICE_API_KEY not set — demo populator disabled");
    return;
  }

  const venice = new OpenAI({
    apiKey: config.veniceApiKey,
    baseURL: "https://api.venice.ai/api/v1",
  });

  const gqlClient = new GraphQLClient(config.subgraphUrl, {
    ...(config.subgraphApiKey ? { headers: { Authorization: `Bearer ${config.subgraphApiKey}` } } : {}),
  });

  console.log("[demo] ═══════════════════════════════════════════════");
  console.log("[demo]  Demo Populator Starting");
  console.log(`[demo]  Accounts:    ${testAccounts.length} test accounts`);
  console.log(`[demo]  Subgraph:    ${config.subgraphUrl.slice(0, 60)}...`);
  console.log(
    `[demo]  Intervals:   events=15m, auctions=1m, bids=1m, settlements=10m`,
  );
  console.log("[demo] ═══════════════════════════════════════════════");

  // Run create-events once immediately (seed)
  try {
    await runCreateEvents(venice, gqlClient, testAccounts);
  } catch (err) {
    console.error(
      "[demo] Initial create-events failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // Set up interval loops — individual on-chain txs are serialized via withAdminLock
  // in marketplace.ts and other service modules. No outer lock needed here.
  setInterval(async () => {
    try {
      await runCreateEvents(venice, gqlClient, testAccounts);
    } catch (err) {
      console.error(
        "[demo] create-events cycle error:",
        err instanceof Error ? err.message : err,
      );
    }
  }, CREATE_EVENTS_INTERVAL_MS);

  setInterval(async () => {
    try {
      await runSpawnAuctions(venice, gqlClient, testAccounts);
    } catch (err) {
      console.error(
        "[demo] spawn-auctions cycle error:",
        err instanceof Error ? err.message : err,
      );
    }
  }, SPAWN_AUCTIONS_INTERVAL_MS);

  setInterval(async () => {
    try {
      await runPlaceBids(gqlClient, testAccounts);
    } catch (err) {
      console.error(
        "[demo] place-bids cycle error:",
        err instanceof Error ? err.message : err,
      );
    }
  }, PLACE_BIDS_INTERVAL_MS);

  setInterval(async () => {
    try {
      await runRequestSettlements(gqlClient);
    } catch (err) {
      console.error(
        "[demo] request-settlements cycle error:",
        err instanceof Error ? err.message : err,
      );
    }
  }, REQUEST_SETTLEMENTS_INTERVAL_MS);

  // Keep the promise alive (never resolves — runs forever)
  await new Promise(() => {});
}
