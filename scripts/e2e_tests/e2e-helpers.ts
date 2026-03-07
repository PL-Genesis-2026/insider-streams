/**
 * Shared E2E test helpers
 *
 * DRY utilities used across all E2E test scripts:
 *   - secret-marketplace-e2e.ts
 *   - user-balance-recording-fallback-e2e.ts
 *   - secret-marketplace-auction-closer-e2e.ts
 *   - simple-market-e2e.ts
 */

import {
  confidentialUsdcAbi,
} from "@private-streams/common";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Environment ────────────────────────────────────────────────────────────

export function envRequired(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`ERROR: ${name} not set`);
    process.exit(1);
  }
  return val;
}

// ─── Logging ────────────────────────────────────────────────────────────────

export function banner(title: string): void {
  const inner = `  ${title}  `;
  const width = Math.max(inner.length, 54);
  const padded = inner.padEnd(width);
  console.log(`\n${"╔" + "═".repeat(width) + "╗"}`);
  console.log(`${"║"}${padded}${"║"}`);
  console.log(`${"╚" + "═".repeat(width) + "╝"}`);
}

let _stepNum = 0;
export function resetStepCounter(): void {
  _stepNum = 0;
}

export function step(msg: string): void {
  _stepNum++;
  console.log(`\n━━━ Step ${_stepNum}: ${msg} ━━━`);
}

export function assert(condition: boolean, msg: string): asserts condition is true {
  if (!condition) {
    console.error(`ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

// ─── Viem client factory ────────────────────────────────────────────────────

function _makePublicClient(rpcUrl: string) {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
}

function _makeWalletClient(pk: Hex, rpcUrl: string) {
  return createWalletClient({
    account: privateKeyToAccount(pk),
    chain: sepolia,
    transport: http(rpcUrl),
  });
}

/** Concrete client types inferred from factory functions */
export type E2EPublicClient = ReturnType<typeof _makePublicClient>;
export type E2EWalletClient = ReturnType<typeof _makeWalletClient>;

export function createClients(opts: {
  ownerPk: Hex;
  bidderPk?: Hex;
  rpcUrl: string;
}) {
  const ownerAccount = privateKeyToAccount(opts.ownerPk);
  const publicClient = _makePublicClient(opts.rpcUrl);
  const ownerClient = _makeWalletClient(opts.ownerPk, opts.rpcUrl);

  const bidderAccount = opts.bidderPk
    ? privateKeyToAccount(opts.bidderPk)
    : undefined;

  if (bidderAccount && ownerAccount.address === bidderAccount.address) {
    console.error("ERROR: OWNER_PK and BIDDER_PK must be different accounts");
    process.exit(1);
  }

  const bidderClient = opts.bidderPk
    ? _makeWalletClient(opts.bidderPk, opts.rpcUrl)
    : undefined;

  return { publicClient, ownerClient, ownerAccount, bidderClient, bidderAccount };
}

// ─── Transaction helpers ────────────────────────────────────────────────────

export async function waitForTx(
  publicClient: E2EPublicClient,
  hash: Hex,
  label: string,
): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    console.error(`  x ${label} failed`);
    console.error(receipt);
    process.exit(1);
  }
  console.log(`  ok ${label} (tx: ${hash.slice(0, 10)}...)`);
  return receipt;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Timing ─────────────────────────────────────────────────────────────────

/**
 * Polls block.timestamp until >= target.
 * Replaces bash `date +%s` / `sleep` pattern.
 */
export async function waitForTimestamp(
  publicClient: E2EPublicClient,
  target: bigint,
  label: string,
): Promise<void> {
  while (true) {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    if (block.timestamp >= target) break;
    const remaining = Number(target - block.timestamp);
    console.log(
      `  ${label}: chain ts=${block.timestamp}, target=${target} (${remaining}s left)...`,
    );
    await sleep(Math.min(remaining * 1000 + 2000, 15000));
  }
  console.log(`  ok ${label} reached`);
}

// ─── USDC balance helper ────────────────────────────────────────────────────

const USDC_DECIMALS = 6;

/**
 * Check USDC balance, mint if below threshold.
 */
export async function ensureUsdcBalance(
  publicClient: E2EPublicClient,
  mintClient: E2EWalletClient,
  usdcAddr: Address,
  target: Address,
  minBalance: bigint,
  mintAmount: bigint,
): Promise<void> {
  const balance = (await publicClient.readContract({
    address: usdcAddr,
    abi: confidentialUsdcAbi,
    functionName: "balanceOf",
    args: [target],
  })) as bigint;

  if (balance < minBalance) {
    const h = await mintClient.writeContract({
      address: usdcAddr,
      abi: confidentialUsdcAbi,
      functionName: "mint",
      args: [target, mintAmount],
    });
    await waitForTx(publicClient, h, `Mint ${formatUnits(mintAmount, USDC_DECIMALS)} USDC to ${target.slice(0, 8)}...`);
  } else {
    console.log(
      `  ok ${target.slice(0, 8)}... has ${formatUnits(balance, USDC_DECIMALS)} USDC`,
    );
  }
}

// ─── CRE CLI helper ─────────────────────────────────────────────────────────

const __filename_ = fileURLToPath(import.meta.url);
const __dirname_ = dirname(__filename_);
const PROJECT_ROOT = resolve(__dirname_, "../..");
const CRE_BIN = `${process.env.HOME}/.cre/bin/cre`;

export function runCRE(opts: {
  workflow: string;
  broadcast?: boolean;
  evmTxHash?: Hex;
  evmEventIndex?: number;
  triggerIndex?: number;
  timeoutMs?: number;
}): string {
  const args = [
    CRE_BIN,
    "workflow",
    "simulate",
    opts.workflow,
    "--target",
    "local-simulation",
    "--non-interactive",
  ];

  if (opts.triggerIndex !== undefined) {
    args.push("--trigger-index", String(opts.triggerIndex));
  }
  if (opts.evmTxHash) {
    args.push("--evm-tx-hash", opts.evmTxHash);
  }
  if (opts.evmEventIndex !== undefined) {
    args.push("--evm-event-index", String(opts.evmEventIndex));
  }
  if (opts.broadcast) {
    args.push("--broadcast");
  }

  const label = `CRE ${opts.workflow}${opts.broadcast ? " (broadcast)" : " (dry run)"}`;
  console.log(`  Running ${label}...`);

  const output = execSync(args.join(" "), {
    cwd: `${PROJECT_ROOT}/cre-workflows`,
    encoding: "utf-8",
    timeout: opts.timeoutMs ?? 120_000,
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.cre/bin:${process.env.PATH}`,
    },
  });

  // Print relevant lines
  const lines = output.split("\n");
  const userLogs = lines.filter(
    (l) => l.includes("[USER LOG]") || l.includes("Workflow Simulation Result"),
  );
  for (const line of userLogs) {
    console.log(`  CRE: ${line.trim()}`);
  }

  return output;
}
