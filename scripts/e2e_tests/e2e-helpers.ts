/**
 * Shared E2E test helpers
 *
 * DRY utilities used across all E2E test scripts:
 *   - secret-marketplace-e2e.ts
 *   - user-balance-recording-fallback-e2e.ts
 *   - secret-marketplace-auction-closer-e2e.ts
 *   - simple-market-e2e.ts
 *   - reputation-resolver-e2e.ts
 *   - force-close-handler-e2e.ts
 */

import {
  confidentialUsdcAbi,
  secretMarketplaceAbi,
} from "@private-streams/common";
import type { Database } from "@private-streams/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  parseEventLogs,
  type Abi,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// ─── Shared constants ──────────────────────────────────────────────────────

export const USDC_DECIMALS = 6;
export const MIN_BALANCE = 10_000_000n;           // 10 USDC
export const MINT_AMOUNT = 10_000_000_000n;       // 10,000 USDC
export const APPROVAL_AMOUNT = 100_000_000_000n;  // 100,000 USDC blanket
export const MIN_ALLOWANCE = 10_000_000n;         // 10 USDC — threshold to trigger approve

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

// ─── Polling ────────────────────────────────────────────────────────────────

/**
 * Poll a condition until it returns truthy or maxAttempts is exceeded.
 * Supports optional exponential backoff (doubles interval each attempt, capped at 30s).
 */
export async function poll<T>(
  fn: () => Promise<T | null | undefined>,
  label: string,
  opts?: {
    maxAttempts?: number;
    intervalMs?: number;
    backoff?: boolean;
  },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 30;
  const baseInterval = opts?.intervalMs ?? 10_000;
  const useBackoff = opts?.backoff ?? false;

  for (let i = 1; i <= maxAttempts; i++) {
    console.log(`  Polling ${label} (attempt ${i}/${maxAttempts})...`);
    const result = await fn();
    if (result) return result;
    if (i < maxAttempts) {
      const delay = useBackoff
        ? Math.min(baseInterval * Math.pow(2, i - 1), 30_000)
        : baseInterval;
      await sleep(delay);
    }
  }
  throw new Error(`Timed out polling for ${label}`);
}

// ─── USDC helpers ───────────────────────────────────────────────────────────

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

/**
 * Check USDC allowance for a spender, approve if below threshold.
 */
export async function ensureUsdcApproval(
  publicClient: E2EPublicClient,
  walletClient: E2EWalletClient,
  usdcAddr: Address,
  owner: Address,
  spender: Address,
  label: string,
): Promise<void> {
  const allowance = (await publicClient.readContract({
    address: usdcAddr,
    abi: confidentialUsdcAbi,
    functionName: "allowance",
    args: [owner, spender],
  })) as bigint;

  if (allowance < MIN_ALLOWANCE) {
    const h = await walletClient.writeContract({
      address: usdcAddr,
      abi: confidentialUsdcAbi,
      functionName: "approve",
      args: [spender, APPROVAL_AMOUNT],
    });
    await waitForTx(publicClient, h, `${label} approval`);
  } else {
    console.log(`  ok ${label} allowance sufficient`);
  }
}

// ─── Event log parsing ──────────────────────────────────────────────────────

/**
 * Parse event logs from a receipt and return the first matching event's args.
 * Asserts at least one event was found.
 */
export function parseFirstEventLog(
  receipt: TransactionReceipt,
  abi: Abi,
  eventName: string,
): Record<string, unknown> {
  const logs = parseEventLogs({ abi: abi as Abi, logs: receipt.logs, eventName });
  assert(logs.length > 0, `No ${eventName} event found in receipt`);
  return (logs[0] as { args: Record<string, unknown> }).args;
}

// ─── Contract read helpers ──────────────────────────────────────────────────

/**
 * Read the ExamplePredictionMarket address from SecretMarketplace.marketplace().
 */
export async function readSimpleMarketAddress(
  publicClient: E2EPublicClient,
  secretMarketplace: Address,
): Promise<Address> {
  return (await publicClient.readContract({
    address: secretMarketplace,
    abi: secretMarketplaceAbi,
    functionName: "marketplace",
  })) as Address;
}

// ─── Supabase helpers ───────────────────────────────────────────────────────

/**
 * Insert the standard set of Supabase records needed for an auction bid test:
 * seller, secret, deposit transfer, and private bid.
 *
 * Use `skipDeposit: true` when the bidder already has a deposit from a prior call
 * (e.g., reputation-resolver's second auction).
 */
export async function setupSupabaseAuctionBid(
  supabase: SupabaseClient<Database>,
  opts: {
    sellerName: string;
    sellerAddress: string;
    auctionId: string;
    secretData: string;
    eventData?: Record<string, unknown>;
    bidderAddress: string;
    bidAmount: bigint;
    depositTxId: string;
    depositAmount: bigint;
    skipDeposit?: boolean;
  },
): Promise<void> {
  // Upsert seller
  const { error: sellerErr } = await supabase
    .from("sellers")
    .upsert({ id: opts.sellerName, address: opts.sellerAddress.toLowerCase() }, { onConflict: "id" });
  assert(!sellerErr, `Failed to upsert seller: ${sellerErr?.message}`);
  console.log(`  ok Seller upserted: ${opts.sellerName} -> ${opts.sellerAddress}`);

  // Upsert secret
  const secretRow: Record<string, unknown> = {
    auction_id: opts.auctionId,
    secret_data: opts.secretData,
    seller_id: opts.sellerName,
  };
  if (opts.eventData) secretRow.event_data = opts.eventData;
  const { error: secretErr } = await supabase
    .from("secrets")
    .upsert(secretRow as never, { onConflict: "auction_id" });
  assert(!secretErr, `Failed to insert secret: ${secretErr?.message}`);
  console.log(`  ok Secret inserted for auction ${opts.auctionId}`);

  // Insert deposit transfer (unless skipped)
  if (!opts.skipDeposit) {
    const { error: depositErr } = await supabase
      .from("transfers")
      .insert({
        transaction_id: opts.depositTxId,
        user_address: opts.bidderAddress.toLowerCase(),
        amount: opts.depositAmount.toString(),
        status: "confirmed",
      });
    assert(!depositErr, `Failed to insert deposit transfer: ${depositErr?.message}`);
    console.log(`  ok Deposit: ${formatUnits(opts.depositAmount, USDC_DECIMALS)} USDC for bidder`);
  }

  // Insert active private bid
  const { error: bidErr } = await supabase
    .from("private_bids")
    .insert({
      auction_id: opts.auctionId,
      bidder_address: opts.bidderAddress.toLowerCase(),
      amount: opts.bidAmount.toString(),
      status: "active",
    });
  assert(!bidErr, `Failed to insert private_bid: ${bidErr?.message}`);
  console.log(`  ok Private bid: ${formatUnits(opts.bidAmount, USDC_DECIMALS)} USDC from bidder`);
}

// ─── CRE CLI helper ─────────────────────────────────────────────────────────

export { runCRE } from "../event-watcher/cre-runner.js";
