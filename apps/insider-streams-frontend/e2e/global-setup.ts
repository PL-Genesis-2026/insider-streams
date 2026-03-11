/**
 * Playwright globalSetup — runs once before all tests.
 *
 * Creates a short-duration prediction market event on Sepolia so the
 * create-auction test has an event to select. Requires OWNER_PK env var
 * (the admin/deployer wallet).
 */
import { readFileSync } from "node:fs";
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

const RPC_URL = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

export default async function globalSetup() {
  const ownerPk = process.env.OWNER_PK;
  if (!ownerPk) {
    console.warn(
      "[global-setup] OWNER_PK not set — skipping event creation. " +
        "Create-auction tests will skip if no events exist on-chain.",
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

  // Check if there are already open events we can use
  const nextEventId = await publicClient.readContract({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
    abi: examplePredictionMarketAbi,
    functionName: "nextEventId",
  });

  // Look for an existing non-settled, non-expired event
  let hasUsableEvent = false;
  for (let i = 0; i < Number(nextEventId); i++) {
    try {
      const event = await publicClient.readContract({
        address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
        abi: examplePredictionMarketAbi,
        functionName: "getEvent",
        args: [BigInt(i)],
      });
      // event is a tuple: [question, endTime, settled, outcome, ...]
      const endTime = Number((event as any)[1] ?? (event as any).endTime);
      const settled = (event as any)[2] ?? (event as any).settled;
      if (!settled && endTime > Math.floor(Date.now() / 1000) + 300) {
        console.log(`[global-setup] Found usable event #${i}, skipping creation`);
        hasUsableEvent = true;
        break;
      }
    } catch {
      // Event may not be readable, skip
    }
  }

  if (hasUsableEvent) return;

  console.log("[global-setup] No usable events found, creating one...");

  // Read INITIAL_LIQUIDITY from the contract
  const initialLiquidity = await publicClient.readContract({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
    abi: examplePredictionMarketAbi,
    functionName: "INITIAL_LIQUIDITY",
  });
  console.log(`[global-setup] INITIAL_LIQUIDITY = ${initialLiquidity}`);

  // Check admin MockUSDC balance
  const balance = await publicClient.readContract({
    address: MOCK_USDC_ADDRESS as Address,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: [account.address],
  });

  // Mint MockUSDC if needed (admin is the owner/minter)
  if (BigInt(balance as bigint) < BigInt(initialLiquidity as bigint)) {
    const mintAmount = BigInt(initialLiquidity as bigint) * 10n; // Mint 10x so we have surplus
    console.log(`[global-setup] Minting ${mintAmount} MockUSDC to admin...`);

    const mintHash = await walletClient.writeContract({
      address: MOCK_USDC_ADDRESS as Address,
      abi: mockUsdcAbi,
      functionName: "mint",
      args: [account.address, mintAmount],
    });
    console.log(`[global-setup] Mint tx: ${mintHash}`);
    await publicClient.waitForTransactionReceipt({ hash: mintHash });
  }

  // Approve ExamplePredictionMarket to spend MockUSDC
  const allowance = await publicClient.readContract({
    address: MOCK_USDC_ADDRESS as Address,
    abi: mockUsdcAbi,
    functionName: "allowance",
    args: [account.address, EXAMPLE_PREDICTION_MARKET_ADDRESS as Address],
  });

  if (BigInt(allowance as bigint) < BigInt(initialLiquidity as bigint)) {
    console.log("[global-setup] Approving ExamplePredictionMarket for MockUSDC...");
    const approveHash = await walletClient.writeContract({
      address: MOCK_USDC_ADDRESS as Address,
      abi: mockUsdcAbi,
      functionName: "approve",
      args: [
        EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
        BigInt(initialLiquidity as bigint) * 100n,
      ],
    });
    console.log(`[global-setup] Approve tx: ${approveHash}`);
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  // Create a prediction market event with a 2-hour duration
  // (long enough for tests, short enough to not pollute the contract)
  const duration = 2n * 60n * 60n; // 2 hours in seconds
  const question = `[E2E Test] Playwright test event created at ${new Date().toISOString()}`;

  console.log(`[global-setup] Creating event: "${question}" (duration: ${duration}s)`);
  const createHash = await walletClient.writeContract({
    address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
    abi: examplePredictionMarketAbi,
    functionName: "newEvent",
    args: [question, duration],
  });
  console.log(`[global-setup] Create event tx: ${createHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
  console.log(`[global-setup] Event created in block ${receipt.blockNumber}`);
}
