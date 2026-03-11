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
  CONFIDENTIAL_USDC_ADDRESS,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  mockUsdcAbi,
  fheConfidentialUsdcAbi,
  examplePredictionMarketAbi,
} from "@private-streams/common";
import { TEST_ACCOUNTS } from "./fixtures";
import {
  createTestAuction,
  createTestAuctionWithFile,
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

/** Retry an async operation on transient RPC errors (429 rate limit, indexing). */
async function retryRpc<T>(fn: () => Promise<T>, maxAttempts = 5, delayMs = 15_000): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = msg.includes("429") || msg.includes("rate limit") || msg.includes("indexing is in progress");
      if (isTransient && i < maxAttempts - 1) {
        console.log(`[global-setup] RPC transient error (attempt ${i + 1}/${maxAttempts}), retrying in ${delayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

/** waitForTransactionReceipt with retry — public RPCs sometimes return
 *  "transaction indexing is in progress" which viem doesn't handle gracefully. */
async function waitForReceipt(
  client: ReturnType<typeof createPublicClient>,
  hash: `0x${string}`,
  maxAttempts = 10,
) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await client.waitForTransactionReceipt({ hash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("indexing is in progress") && i < maxAttempts - 1) {
        console.log(`[global-setup] Tx receipt pending (attempt ${i + 1}/${maxAttempts}), retrying in 5s...`);
        await new Promise((r) => setTimeout(r, 5_000));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Transaction receipt not available after ${maxAttempts} attempts`);
}

export type TestState = {
  eventId: string;
  eventTitle: string;
  bidAuctionId: string;
  closeAuctionId: string;
  fileAuctionId: string;
  fileAuctionContent: string;
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

  const nextEventId = await retryRpc(() =>
    publicClient.readContract({
      address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
      abi: examplePredictionMarketAbi,
      functionName: "nextEventId",
    }),
  );

  let usableEventId: string | null = null;
  let usableEventTitle = "";

  for (let i = 0; i < Number(nextEventId); i++) {
    try {
      const event = await publicClient.readContract({
        address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
        abi: examplePredictionMarketAbi,
        functionName: "getMarketEvent",
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

    const initialLiquidity = (await retryRpc(() =>
      publicClient.readContract({
        address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
        abi: examplePredictionMarketAbi,
        functionName: "INITIAL_LIQUIDITY",
      }),
    )) as bigint;

    const balance = (await retryRpc(() =>
      publicClient.readContract({
        address: MOCK_USDC_ADDRESS as Address,
        abi: mockUsdcAbi,
        functionName: "balanceOf",
        args: [account.address],
      }),
    )) as bigint;

    if (balance < initialLiquidity) {
      const mintAmount = initialLiquidity * 10n;
      console.log(`[global-setup] Minting ${mintAmount} MockUSDC to admin...`);
      const mintHash = await walletClient.writeContract({
        address: MOCK_USDC_ADDRESS as Address,
        abi: mockUsdcAbi,
        functionName: "mint",
        args: [account.address, mintAmount],
      });
      await waitForReceipt(publicClient, mintHash);
    }

    const allowance = (await retryRpc(() =>
      publicClient.readContract({
        address: MOCK_USDC_ADDRESS as Address,
        abi: mockUsdcAbi,
        functionName: "allowance",
        args: [account.address, EXAMPLE_PREDICTION_MARKET_ADDRESS as Address],
      }),
    )) as bigint;

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
      await waitForReceipt(publicClient, approveHash);
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
    await waitForReceipt(publicClient, createHash);

    usableEventId = String(nextEventId);
    console.log(`[global-setup] Created event #${usableEventId}`);
  }

  // ── Step 2: Create test auctions via daemon ────────────────────────────

  // We use the createAuction account for auction creation since the daemon
  // identifies the seller by their wallet address
  const auctionCreatorAccount = privateKeyToAccount(TEST_ACCOUNTS.createAuction);

  // Bid/outbid auction — long duration (1h)
  // Wrapped in try/catch: FHE relayer may be rate-limited (429), causing
  // the daemon to hang beyond the fetch timeout. Tests that need auction IDs
  // have fallback logic to query the subgraph directly.
  let bidAuctionId = "";
  try {
    console.log("[global-setup] Creating bid test auction (1h duration)...");
    const bidAuctionResult = await createTestAuction(auctionCreatorAccount, {
      eventId: usableEventId,
      eventTitle: usableEventTitle,
      privateLeg: "yes",
      secretPayload: "E2E test secret for bid auction",
      durationSeconds: 3600,
    });

    bidAuctionId =
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
  } catch (err) {
    console.warn(
      `[global-setup] Bid auction creation failed (FHE timeout?): ${err instanceof Error ? err.message : err}`,
    );
  }

  // Close auction — very short duration (5 min)
  let closeAuctionId = "";
  try {
    console.log("[global-setup] Creating close test auction (5min duration)...");
    const closeAuctionResult = await createTestAuction(auctionCreatorAccount, {
      eventId: usableEventId,
      eventTitle: usableEventTitle,
      privateLeg: "no",
      secretPayload: "E2E test secret for close auction",
      durationSeconds: 300,
    });

    closeAuctionId =
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
  } catch (err) {
    console.warn(
      `[global-setup] Close auction creation failed (FHE timeout?): ${err instanceof Error ? err.message : err}`,
    );
  }

  // File auction — with .txt file attachment (1h duration)
  let fileAuctionId = "";
  const fileAuctionContent = `E2E test file content — created at ${new Date().toISOString()}`;
  try {
    console.log("[global-setup] Creating file test auction (1h duration)...");
    const fileAuctionResult = await createTestAuctionWithFile(auctionCreatorAccount, {
      eventId: usableEventId,
      eventTitle: usableEventTitle,
      privateLeg: "yes",
      fileContent: fileAuctionContent,
      fileName: "e2e-test-secret.txt",
      durationSeconds: 3600,
    });

    fileAuctionId =
      fileAuctionResult.status === 200
        ? String(fileAuctionResult.data.auctionId ?? "")
        : "";

    if (fileAuctionId) {
      console.log(`[global-setup] File auction created: #${fileAuctionId}`);
    } else {
      console.warn(
        `[global-setup] File auction creation returned status ${fileAuctionResult.status}:`,
        fileAuctionResult.data,
      );
    }
  } catch (err) {
    console.warn(
      `[global-setup] File auction creation failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  // ── Step 3: Fund bidder accounts ───────────────────────────────────────
  //
  // The deposit flow: daemon calls marketplace.depositFor() which does
  // confidentialTransferFrom(admin, contract, amount). The admin must have
  // cUSDC in their wallet for this to work. We check the admin's cUSDC
  // balance and mint a large amount (10M) if it's low, avoiding repeated
  // faucet calls on subsequent runs.
  //
  // Wrapped in try/catch: FHE balance checks and deposits can timeout when
  // the relayer is rate-limited. Tests that need funded accounts will skip.
  try {
    const bidder1 = privateKeyToAccount(TEST_ACCOUNTS.bidder1);
    const bidder2 = privateKeyToAccount(TEST_ACCOUNTS.bidder2);

    // Check bidder marketplace balances
    const checkBalance = async (acct: typeof bidder1) => {
      const { data } = await signedDaemonRequest("/balance", acct);
      return BigInt((data.balance as string) ?? "0");
    };

    const b1Balance = await checkBalance(bidder1);
    const b2Balance = await checkBalance(bidder2);
    const minRequired = 50_000_000n; // 50 USDC

    // Ensure admin has enough cUSDC for deposits.
    // depositFor does confidentialTransferFrom(admin, contract, amount) so
    // the admin EOA must hold cUSDC. Mint 10M upfront when any bidder needs
    // funding. cUSDC is ERC-7984 (all balances encrypted) so we can't cheaply
    // check the plaintext balance — just mint if deposits are needed.
    const needsFunding =
      (b1Balance < minRequired ? 1n : 0n) +
      (b2Balance < minRequired ? 1n : 0n);

    if (needsFunding > 0n) {
      const mintAmount = 10_000_000_000_000n; // 10M cUSDC (6 decimals)
      console.log(`[global-setup] Minting ${Number(mintAmount) / 1e6} cUSDC to admin for deposits...`);
      const mintHash = await walletClient.writeContract({
        address: CONFIDENTIAL_USDC_ADDRESS as Address,
        abi: fheConfidentialUsdcAbi,
        functionName: "mintPlaintext",
        args: [account.address, mintAmount],
      });
      await waitForReceipt(publicClient, mintHash);
      console.log(`[global-setup] Minted 10M cUSDC to admin: ${mintHash}`);
    }

    // Helper: deposit funds for a user account
    const fundUser = async (
      userAccount: typeof bidder1,
      amountUsdc: number,
      label: string,
    ) => {
      await depositFunds(userAccount, amountUsdc);
      console.log(`[global-setup] Waiting for ${label} deposit to confirm...`);
      try {
        const bal = await waitForBalance(userAccount, minRequired, 180_000);
        console.log(`[global-setup] ${label} balance: ${bal}`);
      } catch (err) {
        console.warn(
          `[global-setup] WARNING: ${label} deposit may not have confirmed: ${err}\n` +
            `  This usually means the admin wallet doesn't have enough cUSDC for depositFor.\n` +
            `  Check admin cUSDC balance and ensure mintPlaintext succeeded.`,
        );
      }
    };

    // Deposits must be sequential — daemon submits on-chain txs asynchronously
    // from a single admin wallet. Concurrent deposits cause nonce collisions.
    if (b1Balance < minRequired) {
      console.log(
        `[global-setup] Depositing 100 USDC for bidder1 (balance: ${b1Balance})...`,
      );
      await fundUser(bidder1, 100, "bidder1");
    } else {
      console.log(
        `[global-setup] Bidder1 already funded: ${b1Balance} (${Number(b1Balance) / 1e6} USDC)`,
      );
    }

    if (b2Balance < minRequired) {
      console.log(
        `[global-setup] Depositing 100 USDC for bidder2 (balance: ${b2Balance})...`,
      );
      await fundUser(bidder2, 100, "bidder2");
    } else {
      console.log(
        `[global-setup] Bidder2 already funded: ${b2Balance} (${Number(b2Balance) / 1e6} USDC)`,
      );
    }
  } catch (err) {
    console.warn(
      `[global-setup] Funding step failed (FHE timeout?): ${err instanceof Error ? err.message : err}`,
    );
  }

  // ── Step 4: Write test state ───────────────────────────────────────────

  const testState: TestState = {
    eventId: usableEventId,
    eventTitle: usableEventTitle,
    bidAuctionId,
    closeAuctionId,
    fileAuctionId,
    fileAuctionContent,
  };

  writeFileSync(STATE_PATH, JSON.stringify(testState, null, 2));
  console.log(
    `[global-setup] Test state written: ${JSON.stringify(testState)}`,
  );
}
