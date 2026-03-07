/**
 * Deposit Reconciler E2E Test Script
 *
 * Tests the full lifecycle of tracking user balances via private transfers:
 *
 *   1. Mint DEMO tokens to bidder (the "user" depositing into the platform)
 *   2. Approve vault + vault-deposit to fund bidder's private balance
 *   3. Bidder does a private transfer TO the platform EOA (owner) — this is
 *      the "deposit" the CRE picks up (API type="transfer", is_incoming=true)
 *   4. Poll API until the incoming transfer appears
 *   5. Run CRE deposit-reconciler simulation
 *   6. Verify Supabase has the deposit in the unified transfers table
 *   7. Check balances VIEW shows the deposited amount as available
 *   8. Run CRE again — verify idempotency (no duplicates)
 *   9. Owner does a private transfer TO bidder (withdrawal from platform) —
 *      CRE picks this up (API type="transfer", is_incoming=false)
 *  10. Poll API until outgoing transfer appears
 *  11. Run CRE simulation again (picks up withdrawal)
 *  12. Verify transfers table has the withdrawal record
 *  13. Check balances VIEW — available decreased by withdrawal amount
 *
 * The CRE workflow only tracks API type="transfer" transactions (private
 * transfers with sender/recipient/is_incoming). Vault deposits (API
 * type="deposit") are NOT tracked — they're just a prerequisite to fund
 * private balances before making private transfers.
 *
 * Env vars required:
 *   OWNER_PK                    — platform EOA (signs API requests, receives deposits)
 *   BIDDER_PK                   — user who deposits into the platform
 *   RPC_URL                     — Eth Sepolia RPC
 *   SUPABASE_URL                — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — Supabase service role key
 *
 * Usage: pnpm e2e:deposits
 */

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import {
  PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
  CONFIDENTIAL_USDC_DECIMALS,
  confidentialUsdcAbi,
  VAULT_ADDRESS,
} from "@private-streams/common";
import type { Database } from "@private-streams/common";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Config ──────────────────────────────────────────────────────────────────

function envRequired(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`ERROR: ${name} not set`);
    process.exit(1);
  }
  return val;
}

const OWNER_PK = envRequired("OWNER_PK") as Hex;
const BIDDER_PK = envRequired("BIDDER_PK") as Hex;
const RPC_URL = envRequired("RPC_URL");
const SUPABASE_URL = envRequired("SUPABASE_URL");
const SUPABASE_KEY = envRequired("SUPABASE_SERVICE_ROLE_KEY");

// Contract addresses
const SIMPLE_TOKEN: Address = PRIVATE_CONFIDENTIAL_USDC_ADDRESS;
const VAULT: Address = VAULT_ADDRESS;
const PRIVATE_TOKEN_API = "https://convergence2026-token-api.cldev.cloud";
const CHAIN_ID = 11155111;

// EIP-712 domain (same as CRE workflow types.ts)
const EIP712_DOMAIN = {
  name: "CompliantPrivateTokenDemo",
  version: "0.0.1",
  chainId: CHAIN_ID,
  verifyingContract: VAULT as `0x${string}`,
} as const;

// Amounts (6 decimals)
const VAULT_DEPOSIT = 3_000_000n;      // 3 tokens — fund bidder's private balance
const DEPOSIT_AMOUNT = 2_000_000n;     // 2 tokens — bidder → platform EOA (deposit)
const WITHDRAWAL_AMOUNT = 1_000_000n;  // 1 token — platform EOA → bidder (withdrawal)

// Project root for CRE invocation
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");
const CRE_BIN = `${process.env.HOME}/.cre/bin/cre`;

// ─── ABI fragments ───────────────────────────────────────────────────────────

const vaultAbi = [
  {
    name: "deposit",
    type: "function",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ─── Clients ─────────────────────────────────────────────────────────────────

const ownerAccount = privateKeyToAccount(OWNER_PK);
const ownerAddr = ownerAccount.address;
const bidderAccount = privateKeyToAccount(BIDDER_PK);
const bidderAddr = bidderAccount.address;

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const ownerWallet = createWalletClient({
  account: ownerAccount,
  chain: sepolia,
  transport: http(RPC_URL),
});

const bidderWallet = createWalletClient({
  account: bidderAccount,
  chain: sepolia,
  transport: http(RPC_URL),
});

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);

// ─── Helpers ─────────────────────────────────────────────────────────────────

let stepNum = 0;
function step(msg: string) {
  stepNum++;
  console.log(`\n━━━ Step ${stepNum}: ${msg} ━━━`);
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

async function waitForTx(hash: Hex, label: string) {
  console.log(`  Waiting for ${label}... (${hash})`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert(receipt.status === "success", `${label} reverted`);
  console.log(`  ✓ ${label} confirmed (block ${receipt.blockNumber})`);
  return receipt;
}

/** Poll a condition until it returns truthy or maxAttempts is exceeded */
async function poll<T>(
  fn: () => Promise<T | null | undefined>,
  label: string,
  maxAttempts = 30,
  intervalMs = 10_000,
): Promise<T> {
  for (let i = 1; i <= maxAttempts; i++) {
    console.log(`  Polling ${label} (attempt ${i}/${maxAttempts})...`);
    const result = await fn();
    if (result) return result;
    if (i < maxAttempts) await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out polling for ${label}`);
}

/**
 * Fetch transactions from Private Token API using EIP-712 signed request.
 * Fetches from the OWNER's perspective (the platform EOA).
 */
async function fetchApiTransactions(): Promise<
  { id: string; type: string; tx_hash?: string; is_incoming?: boolean; token?: string; sender?: string; recipient?: string }[]
> {
  const timestamp = Math.floor(Date.now() / 1000);

  const signature = await ownerAccount.signTypedData({
    domain: EIP712_DOMAIN,
    types: {
      "List Transactions": [
        { name: "account", type: "address" },
        { name: "timestamp", type: "uint256" },
        { name: "cursor", type: "string" },
        { name: "limit", type: "uint256" },
      ],
    },
    primaryType: "List Transactions",
    message: {
      account: ownerAddr,
      timestamp: BigInt(timestamp),
      cursor: "",
      limit: 100n,
    },
  });

  const resp = await fetch(`${PRIVATE_TOKEN_API}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account: ownerAddr,
      timestamp,
      auth: signature,
      limit: 100,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`POST /transactions failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as { transactions?: Record<string, unknown>[] };
  return (data.transactions ?? []) as {
    id: string;
    type: string;
    tx_hash?: string;
    is_incoming?: boolean;
    token?: string;
    sender?: string;
    recipient?: string;
  }[];
}

/**
 * Execute a private transfer via POST /private-transfer.
 * The signer (account) is the sender.
 * Returns the API transaction_id.
 */
async function executePrivateTransfer(
  signer: ReturnType<typeof privateKeyToAccount>,
  recipient: Address,
  amount: bigint,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);

  const signature = await signer.signTypedData({
    domain: EIP712_DOMAIN,
    types: {
      "Private Token Transfer": [
        { name: "sender", type: "address" },
        { name: "recipient", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "flags", type: "string[]" },
        { name: "timestamp", type: "uint256" },
      ],
    },
    primaryType: "Private Token Transfer",
    message: {
      sender: signer.address,
      recipient,
      token: SIMPLE_TOKEN,
      amount,
      flags: [],
      timestamp: BigInt(timestamp),
    },
  });

  const resp = await fetch(`${PRIVATE_TOKEN_API}/private-transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account: signer.address,
      recipient,
      token: SIMPLE_TOKEN,
      amount: amount.toString(),
      flags: [],
      timestamp,
      auth: signature,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`POST /private-transfer failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as { transaction_id: string };
  console.log(`  Private transfer submitted: ${signer.address.slice(0, 10)}→${recipient.slice(0, 10)} amount=${formatUnits(amount, CONFIDENTIAL_USDC_DECIMALS)} tx_id=${data.transaction_id}`);
  return data.transaction_id;
}

/** Run CRE deposit-reconciler simulation — throws on failure */
function runCRESimulation(): string {
  console.log("  Running CRE deposit-reconciler simulation...");
  const output = execSync(
    `${CRE_BIN} workflow simulate deposit-reconciler --target local-simulation --non-interactive --trigger-index 0`,
    {
      cwd: `${PROJECT_ROOT}/cre-workflows`,
      encoding: "utf-8",
      timeout: 120_000,
      env: { ...process.env, PATH: `${process.env.HOME}/.cre/bin:${process.env.PATH}` },
    },
  );
  // Print relevant lines
  const lines = output.split("\n");
  const userLogs = lines.filter((l) => l.includes("[USER LOG]") || l.includes("Workflow Simulation Result"));
  for (const line of userLogs) {
    console.log(`  CRE: ${line.trim()}`);
  }
  return output;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║     Deposit Reconciler E2E Test                     ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Owner (platform EOA): ${ownerAddr}`);
  console.log(`  Bidder (user):        ${bidderAddr}`);
  console.log(`  Token (DEMO):         ${SIMPLE_TOKEN}`);
  console.log(`  Vault:                ${VAULT}`);
  console.log(`  API:                  ${PRIVATE_TOKEN_API}`);
  console.log(`  Supabase:             ${SUPABASE_URL}`);

  // Record the count of existing deposits before we start, so we can
  // isolate our test from prior data in assertions
  const { count: existingDepositCount } = await supabase
    .from("transfers")
    .select("*", { count: "exact", head: true })
    .eq("status", "confirmed")
    .eq("user_address", bidderAddr.toLowerCase());
  console.log(`  Existing deposit count for bidder: ${existingDepositCount}`);

  // ── Step 1: Mint DEMO tokens to bidder ─────────────────────────────────────
  step("Mint DEMO tokens to bidder");
  const mintHash = await ownerWallet.writeContract({
    address: SIMPLE_TOKEN,
    abi: confidentialUsdcAbi,
    functionName: "mint",
    args: [bidderAddr, VAULT_DEPOSIT + 1_000_000n], // extra buffer
  });
  await waitForTx(mintHash, "mint");

  const balance = await publicClient.readContract({
    address: SIMPLE_TOKEN,
    abi: confidentialUsdcAbi,
    functionName: "balanceOf",
    args: [bidderAddr],
  });
  console.log(`  Bidder DEMO balance: ${formatUnits(balance, CONFIDENTIAL_USDC_DECIMALS)}`);

  // ── Step 2: Vault deposit to fund bidder's private balance ─────────────────
  step("Approve vault + deposit to fund bidder's private balance");
  const approveHash = await bidderWallet.writeContract({
    address: SIMPLE_TOKEN,
    abi: confidentialUsdcAbi,
    functionName: "approve",
    args: [VAULT, VAULT_DEPOSIT],
  });
  await waitForTx(approveHash, "approve vault");

  const vaultDepositHash = await bidderWallet.writeContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "deposit",
    args: [SIMPLE_TOKEN, VAULT_DEPOSIT],
  });
  await waitForTx(vaultDepositHash, `vault deposit (${formatUnits(VAULT_DEPOSIT, CONFIDENTIAL_USDC_DECIMALS)} DEMO)`);

  // Wait for vault deposit to appear in API (ensures bidder has private balance)
  step("Poll API until vault deposit is processed");
  await poll(
    async () => {
      // Fetch from bidder's perspective to check their private balance is funded
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await bidderAccount.signTypedData({
        domain: EIP712_DOMAIN,
        types: {
          "List Transactions": [
            { name: "account", type: "address" },
            { name: "timestamp", type: "uint256" },
            { name: "cursor", type: "string" },
            { name: "limit", type: "uint256" },
          ],
        },
        primaryType: "List Transactions",
        message: {
          account: bidderAddr,
          timestamp: BigInt(timestamp),
          cursor: "",
          limit: 100n,
        },
      });

      const resp = await fetch(`${PRIVATE_TOKEN_API}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: bidderAddr,
          timestamp,
          auth: signature,
          limit: 100,
        }),
      });

      if (!resp.ok) return null;
      const data = (await resp.json()) as { transactions?: { type: string; tx_hash?: string }[] };
      const found = (data.transactions ?? []).find(
        (t) => t.type === "deposit" && t.tx_hash?.toLowerCase() === vaultDepositHash.toLowerCase(),
      );
      if (found) {
        console.log(`  ✓ Vault deposit visible in API`);
        return found;
      }
      console.log(`  Vault deposit not yet visible...`);
      return null;
    },
    "vault deposit in API",
    30,
    10_000,
  );

  // ── Step 3: Bidder → Owner private transfer (deposit into platform) ────────
  step("Bidder does private transfer TO platform EOA (deposit)");
  const depositTxId = await executePrivateTransfer(bidderAccount, ownerAddr, DEPOSIT_AMOUNT);

  // ── Step 4: Poll API until incoming transfer appears ───────────────────────
  step("Poll API for incoming private transfer (deposit)");
  const incomingTx = await poll(
    async () => {
      const txs = await fetchApiTransactions();
      const found = txs.find(
        (t) =>
          t.type === "transfer" &&
          t.is_incoming === true &&
          t.id === depositTxId,
      );
      if (found) {
        console.log(`  ✓ Found incoming transfer: id=${found.id}, sender=${found.sender}, is_incoming=${found.is_incoming}`);
        return found;
      }
      console.log(`  Transfer ${depositTxId} not yet visible...`);
      return null;
    },
    "incoming transfer in API",
    30,
    10_000,
  );

  // ── Step 5: Run CRE deposit-reconciler simulation ──────────────────────────
  step("Run CRE deposit-reconciler simulation (first run)");
  runCRESimulation();

  // ── Step 6: Verify deposit in Supabase ─────────────────────────────────────
  step("Verify deposit in Supabase transfers table");

  const { data: dep } = await supabase
    .from("transfers")
    .select("*")
    .eq("transaction_id", depositTxId)
    .single();
  assert(!!dep, `Deposit (${depositTxId}) not found in Supabase`);
  console.log(`  ✓ Deposit: amount=${dep!.amount}, status=${dep!.status}`);
  console.log(`  ✓ sender_address=${dep!.sender_address}, user_address=${dep!.user_address}`);

  // ── Step 7: Check balances VIEW ────────────────────────────────────────────
  step("Check balances VIEW");
  // The deposit's user_address is the sender (bidder), so check bidder's balance
  const { data: balBefore } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAddr.toLowerCase())
    .single();
  assert(!!balBefore, "Balance not found in balances VIEW for bidder");
  console.log(`  Available balance: ${formatUnits(BigInt(balBefore!.available_balance!), CONFIDENTIAL_USDC_DECIMALS)} DEMO`);
  console.log(`  Locked balance:    ${formatUnits(BigInt(balBefore!.locked_balance!), CONFIDENTIAL_USDC_DECIMALS)} DEMO`);
  console.log(`  Pending withdrawal: ${formatUnits(BigInt(balBefore!.pending_withdrawal!), CONFIDENTIAL_USDC_DECIMALS)} DEMO`);

  const availBefore = BigInt(balBefore!.available_balance!);
  assert(availBefore >= DEPOSIT_AMOUNT, `Available balance ${availBefore} < deposit ${DEPOSIT_AMOUNT}`);
  console.log(`  ✓ Available balance includes ${formatUnits(DEPOSIT_AMOUNT, CONFIDENTIAL_USDC_DECIMALS)} DEMO deposit`);

  // ── Step 8: Idempotency check — run CRE again ─────────────────────────────
  step("Idempotency check — run CRE simulation again");
  const { count: countBefore } = await supabase
    .from("transfers")
    .select("*", { count: "exact", head: true })
    .eq("status", "confirmed")
    .eq("user_address", bidderAddr.toLowerCase());

  runCRESimulation();

  const { count: countAfter } = await supabase
    .from("transfers")
    .select("*", { count: "exact", head: true })
    .eq("status", "confirmed")
    .eq("user_address", bidderAddr.toLowerCase());
  assert(countBefore === countAfter, `Deposit count changed: ${countBefore} → ${countAfter}`);
  console.log(`  ✓ Deposit count unchanged (${countAfter}) — idempotency works`);

  // ── Step 9: Owner → Bidder private transfer (withdrawal from platform) ─────
  step("Owner does private transfer TO bidder (withdrawal)");
  const withdrawalTxId = await executePrivateTransfer(ownerAccount, bidderAddr, WITHDRAWAL_AMOUNT);
  console.log(`  Withdrawal transaction_id: ${withdrawalTxId}`);

  // ── Step 10: Poll API until outgoing transfer appears ──────────────────────
  step("Poll API for outgoing transfer (withdrawal)");
  await poll(
    async () => {
      const txs = await fetchApiTransactions();
      const found = txs.find(
        (t) =>
          t.type === "transfer" &&
          t.is_incoming === false &&
          t.id === withdrawalTxId,
      );
      if (found) {
        console.log(`  ✓ Found outgoing transfer: id=${found.id}, is_incoming=${found.is_incoming}`);
        return found;
      }
      console.log(`  Transfer ${withdrawalTxId} not yet visible...`);
      return null;
    },
    "outgoing transfer in API",
    30,
    10_000,
  );

  // ── Step 11: Run CRE simulation to pick up the withdrawal ──────────────────
  step("Run CRE simulation (picks up outgoing transfer)");
  runCRESimulation();

  // ── Step 12: Verify withdrawal in Supabase ─────────────────────────────────
  step("Verify withdrawal in Supabase transfers table");
  const { data: transfer } = await supabase
    .from("transfers")
    .select("*")
    .eq("transaction_id", withdrawalTxId)
    .single();
  assert(!!transfer, `Withdrawal ${withdrawalTxId} not found in Supabase`);
  assert(transfer!.status === "completed", `Expected status=completed, got ${transfer!.status}`);
  console.log(`  ✓ Withdrawal: amount=${transfer!.amount}, status=${transfer!.status}`);

  // ── Step 13: Check balances VIEW — available decreased ─────────────────────
  step("Check balances VIEW after withdrawal");
  const { data: balAfter } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAddr.toLowerCase())
    .single();
  assert(!!balAfter, "Balance not found after withdrawal");

  const availAfter = BigInt(balAfter!.available_balance!);
  console.log(`  Available balance before: ${formatUnits(availBefore, CONFIDENTIAL_USDC_DECIMALS)} DEMO`);
  console.log(`  Available balance after:  ${formatUnits(availAfter, CONFIDENTIAL_USDC_DECIMALS)} DEMO`);
  console.log(`  Difference:               ${formatUnits(availBefore - availAfter, CONFIDENTIAL_USDC_DECIMALS)} DEMO`);

  assert(
    availAfter < availBefore,
    `Balance did not decrease after withdrawal: ${availBefore} → ${availAfter}`,
  );
  assert(
    availBefore - availAfter === WITHDRAWAL_AMOUNT,
    `Balance decreased by ${availBefore - availAfter}, expected ${WITHDRAWAL_AMOUNT}`,
  );
  console.log(`  ✓ Balance decreased by exactly ${formatUnits(WITHDRAWAL_AMOUNT, CONFIDENTIAL_USDC_DECIMALS)} DEMO`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║     ALL TESTS PASSED ✓                              ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  Vault deposit:   ${vaultDepositHash.slice(0, 20)}... (funds private balance)`);
  console.log(`║  Deposit (in):    ${depositTxId} (bidder → platform)`);
  console.log(`║  Withdrawal (out): ${withdrawalTxId} (platform → bidder)`);
  console.log(`║  Balance:         ${formatUnits(availBefore, CONFIDENTIAL_USDC_DECIMALS)} → ${formatUnits(availAfter, CONFIDENTIAL_USDC_DECIMALS)} DEMO`);
  console.log("╚══════════════════════════════════════════════════════╝");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✗ E2E test failed:", err);
    process.exit(1);
  });
