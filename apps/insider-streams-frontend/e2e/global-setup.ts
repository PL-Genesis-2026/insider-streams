/**
 * Playwright globalSetup — runs once before all tests.
 *
 * 1. Creates a prediction market event on Sepolia (or finds an existing one)
 * 2. Creates test auctions for bid/outbid and close tests
 * 3. Deposits funds for bidder test accounts
 * 4. Writes state to .test-state.json for tests to read
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  MOCK_USDC_ADDRESS,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  mockUsdcAbi,
  examplePredictionMarketAbi,
} from "@private-streams/common";
import { TEST_ACCOUNTS } from "./fixtures";
import {
  createTestAuction,
  depositFunds,
  waitForBalance,
  signedDaemonRequest,
} from "./helpers";

// Load env vars from the repo root .env (contains OWNER_PK, RPC_URL)
function loadEnvFile(path: string) {
  try {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      const value = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // File not found, skip
  }
}

// Try loading from worktree root and main repo root .env files
const worktreeRoot = resolve(__dirname, "../../../");
const mainRepoRoot = resolve(__dirname, "../../../../../");
for (const root of [worktreeRoot, mainRepoRoot]) {
  loadEnvFile(resolve(root, ".env"));
  loadEnvFile(resolve(root, "scripts/.env"));
}

const RPC_URL =
  process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

export type TestState = {
  eventId: string;
  eventTitle: string;
  bidAuctionId: string;
  closeAuctionId: string;
};

const STATE_PATH = resolve(__dirname, ".test-state.json");

export function readTestState(): TestState {
  return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
}

export default async function globalSetup() {
  const ownerPk = process.env.OWNER_PK;
  if (!ownerPk) {
    console.warn(
      "[global-setup] OWNER_PK not set — skipping setup. " +
        "Auction lifecycle tests will skip.",
    );
    return;
  }

  const account = privateKeyToAccount(ownerPk as `0x${string}`);
  const transport = http(RPC_URL);

  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });

  console.log(`[global-setup] Admin wallet: ${account.address}`);

  // ── Step 1: Find or create a prediction market event ──────────────────

  const nextEventId = await publicClient.readContract({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
    abi: examplePredictionMarketAbi,
    functionName: "nextEventId",
  });

  let usableEventId: string | null = null;
  let usableEventTitle = "";

  for (let i = 0; i < Number(nextEventId); i++) {
    try {
      const event = await publicClient.readContract({
        address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
        abi: examplePredictionMarketAbi,
        functionName: "getEvent",
        args: [BigInt(i)],
      });
      const endTime = Number((event as any)[1] ?? (event as any).endTime);
      const settled = (event as any)[2] ?? (event as any).settled;
      const question = (event as any)[0] ?? (event as any).question;
      if (!settled && endTime > Math.floor(Date.now() / 1000) + 600) {
        console.log(
          `[global-setup] Found usable event #${i}, skipping creation`,
        );
        usableEventId = String(i);
        usableEventTitle = String(question);
        break;
      }
    } catch {
      // skip
    }
  }

  if (!usableEventId) {
    console.log("[global-setup] No usable events found, creating one...");

    const initialLiquidity = (await publicClient.readContract({
      address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
      abi: examplePredictionMarketAbi,
      functionName: "INITIAL_LIQUIDITY",
    })) as bigint;

    const balance = (await publicClient.readContract({
      address: MOCK_USDC_ADDRESS as Address,
      abi: mockUsdcAbi,
      functionName: "balanceOf",
      args: [account.address],
    })) as bigint;

    if (balance < initialLiquidity) {
      const mintAmount = initialLiquidity * 10n;
      console.log(`[global-setup] Minting ${mintAmount} MockUSDC to admin...`);
      const mintHash = await walletClient.writeContract({
        address: MOCK_USDC_ADDRESS as Address,
        abi: mockUsdcAbi,
        functionName: "mint",
        args: [account.address, mintAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash: mintHash });
    }

    const allowance = (await publicClient.readContract({
      address: MOCK_USDC_ADDRESS as Address,
      abi: mockUsdcAbi,
      functionName: "allowance",
      args: [account.address, EXAMPLE_PREDICTION_MARKET_ADDRESS as Address],
    })) as bigint;

    if (allowance < initialLiquidity) {
      console.log(
        "[global-setup] Approving ExamplePredictionMarket for MockUSDC...",
      );
      const approveHash = await walletClient.writeContract({
        address: MOCK_USDC_ADDRESS as Address,
        abi: mockUsdcAbi,
        functionName: "approve",
        args: [
          EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
          initialLiquidity * 100n,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    const duration = 2n * 60n * 60n;
    usableEventTitle = `[E2E Test] Playwright event ${new Date().toISOString()}`;

    console.log(
      `[global-setup] Creating event: "${usableEventTitle}" (${duration}s)`,
    );
    const createHash = await walletClient.writeContract({
      address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
      abi: examplePredictionMarketAbi,
      functionName: "newEvent",
      args: [usableEventTitle, duration],
    });
    await publicClient.waitForTransactionReceipt({ hash: createHash });

    usableEventId = String(nextEventId);
    console.log(`[global-setup] Created event #${usableEventId}`);
  }

  // ── Step 2: Create test auctions via daemon ────────────────────────────

  // We use the createAuction account for auction creation since the daemon
  // identifies the seller by their wallet address
  const auctionCreatorAccount = privateKeyToAccount(TEST_ACCOUNTS.createAuction);

  // Bid/outbid auction — long duration (1h)
  console.log("[global-setup] Creating bid test auction (1h duration)...");
  const bidAuctionResult = await createTestAuction(auctionCreatorAccount, {
    eventId: usableEventId,
    eventTitle: usableEventTitle,
    privateLeg: "yes",
    secretPayload: "E2E test secret for bid auction",
    durationSeconds: 3600,
  });

  const bidAuctionId =
    bidAuctionResult.status === 200
      ? String(bidAuctionResult.data.auctionId ?? "")
      : "";

  if (bidAuctionId) {
    console.log(`[global-setup] Bid auction created: #${bidAuctionId}`);
  } else {
    console.warn(
      `[global-setup] Bid auction creation returned status ${bidAuctionResult.status}:`,
      bidAuctionResult.data,
    );
  }

  // Close auction — very short duration (5 min)
  console.log("[global-setup] Creating close test auction (5min duration)...");
  const closeAuctionResult = await createTestAuction(auctionCreatorAccount, {
    eventId: usableEventId,
    eventTitle: usableEventTitle,
    privateLeg: "no",
    secretPayload: "E2E test secret for close auction",
    durationSeconds: 300,
  });

  const closeAuctionId =
    closeAuctionResult.status === 200
      ? String(closeAuctionResult.data.auctionId ?? "")
      : "";

  if (closeAuctionId) {
    console.log(`[global-setup] Close auction created: #${closeAuctionId}`);
  } else {
    console.warn(
      `[global-setup] Close auction creation returned status ${closeAuctionResult.status}:`,
      closeAuctionResult.data,
    );
  }

  // ── Step 3: Fund bidder accounts ───────────────────────────────────────

  const bidder1 = privateKeyToAccount(TEST_ACCOUNTS.bidder1);
  const bidder2 = privateKeyToAccount(TEST_ACCOUNTS.bidder2);

  // Check if already funded
  const checkBalance = async (acct: typeof bidder1) => {
    const { data } = await signedDaemonRequest("/balance", acct);
    return BigInt((data.balance as string) ?? "0");
  };

  const b1Balance = await checkBalance(bidder1);
  const b2Balance = await checkBalance(bidder2);
  const minRequired = 50_000_000n; // 50 USDC

  // Deposits must be sequential — daemon submits on-chain txs asynchronously
  // from a single admin wallet. Concurrent deposits cause nonce collisions.
  if (b1Balance < minRequired) {
    console.log(
      `[global-setup] Depositing 100 USDC for bidder1 (balance: ${b1Balance})...`,
    );
    await depositFunds(bidder1, 100);
    console.log("[global-setup] Waiting for bidder1 deposit to confirm...");
    try {
      const bal = await waitForBalance(bidder1, minRequired, 180_000);
      console.log(`[global-setup] Bidder1 balance: ${bal}`);
    } catch (err) {
      console.warn(`[global-setup] Bidder1 deposit may not have confirmed: ${err}`);
    }
  } else {
    console.log(
      `[global-setup] Bidder1 already funded: ${b1Balance} (${Number(b1Balance) / 1e6} USDC)`,
    );
  }

  if (b2Balance < minRequired) {
    console.log(
      `[global-setup] Depositing 100 USDC for bidder2 (balance: ${b2Balance})...`,
    );
    await depositFunds(bidder2, 100);
    console.log("[global-setup] Waiting for bidder2 deposit to confirm...");
    try {
      const bal = await waitForBalance(bidder2, minRequired, 180_000);
      console.log(`[global-setup] Bidder2 balance: ${bal}`);
    } catch (err) {
      console.warn(`[global-setup] Bidder2 deposit may not have confirmed: ${err}`);
    }
  } else {
    console.log(
      `[global-setup] Bidder2 already funded: ${b2Balance} (${Number(b2Balance) / 1e6} USDC)`,
    );
  }

  // ── Step 4: Write test state ───────────────────────────────────────────

  const testState: TestState = {
    eventId: usableEventId,
    eventTitle: usableEventTitle,
    bidAuctionId,
    closeAuctionId,
  };

  writeFileSync(STATE_PATH, JSON.stringify(testState, null, 2));
  console.log(
    `[global-setup] Test state written: ${JSON.stringify(testState)}`,
  );
}
