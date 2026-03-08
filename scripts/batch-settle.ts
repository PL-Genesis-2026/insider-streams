/**
 * batch-settle.ts — Request settlement for all closed but unsettled events.
 *
 * Usage: npx tsx batch-settle.ts [--dry-run]
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  examplePredictionMarketAbi,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
} from "@private-streams/common";

const RPC_URL = process.env.RPC_URL ?? "https://eth-sepolia.g.alchemy.com/v2/59LCREaM5uGpTVXZgR8A7z6IiULWjwG6";
const OWNER_PK = process.env.OWNER_PK;

if (!OWNER_PK) {
  console.error("OWNER_PK env var required");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const account = privateKeyToAccount(OWNER_PK as Hex);
const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(RPC_URL),
});

const contract = {
  address: EXAMPLE_PREDICTION_MARKET_ADDRESS as `0x${string}`,
  abi: examplePredictionMarketAbi,
} as const;

async function main() {
  const nextEventId = await publicClient.readContract({
    ...contract,
    functionName: "nextEventId",
  });

  console.log(`Total events: ${nextEventId}`);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const toSettle: bigint[] = [];

  for (let i = 0n; i < nextEventId; i++) {
    const event = await publicClient.readContract({
      ...contract,
      functionName: "getEvent",
      args: [i],
    });

    const status = event.status;
    const eventClose = event.eventClose;

    // Status.Open = 0, and event has closed
    if (status === 0 && eventClose > 0n && eventClose <= now) {
      toSettle.push(i);
      console.log(`  Event #${i}: closed, unsettled — "${event.question}"`);
    }
  }

  console.log(`\nFound ${toSettle.length} event(s) to settle`);

  if (dryRun) {
    console.log("Dry run — not submitting transactions");
    return;
  }

  for (const eventId of toSettle) {
    try {
      const hash = await walletClient.writeContract({
        ...contract,
        functionName: "requestSettlement",
        args: [eventId],
      });
      console.log(`  Event #${eventId}: requestSettlement tx ${hash}`);
      // Wait for confirmation before next to avoid nonce issues
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  Event #${eventId}: confirmed`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Event #${eventId}: FAILED — ${msg}`);
    }
  }

  console.log("\nDone");
}

main().catch(console.error);
