/**
 * Deposit Reconciler E2E Test Script
 *
 * Full lifecycle test on Eth Sepolia:
 *   1. Mint DEMO tokens to owner
 *   2. Approve vault + deposit 2 DEMO (tx1)
 *   3. Deposit 1 more DEMO (tx2)
 *   4. Poll Private Token API until both deposits appear
 *   5. Run CRE deposit-reconciler simulation
 *   6. Verify Supabase has both deposits
 *   7. Check balances VIEW shows 3 DEMO available
 *   8. Run CRE again — verify idempotency (no duplicates)
 *   9. Private-transfer 1 DEMO back to depositor (from platform EOA)
 *  10. Poll API until outgoing transfer appears
 *  11. Run CRE simulation again (picks up transfer)
 *  12. Verify transfers table has the record
 *  13. Check balances VIEW — available decreased by 1 DEMO
 *
 * Env vars required:
 *   OWNER_PK                    — platform EOA (mints, deposits, signs API requests)
 *   BIDDER_PK                   — recipient for outgoing transfer (different from owner)
 *   RPC_URL                     — Eth Sepolia RPC
 *   SUPABASE_URL                — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — Supabase service role key
 *
 * Usage: pnpm e2e:deposits
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@private-streams/common";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
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

// Contract addresses (from CLAUDE.md)
const SIMPLE_TOKEN: Address = "0xB308Ef20527c5215ec2B2B10F52b311f3AAc6EEB";
const VAULT: Address = "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13";
const PRIVATE_TOKEN_API = "https://convergence2026-token-api.cldev.cloud";
const CHAIN_ID = 11155111;

// EIP-712 domain (same as CRE workflow types.ts)
const EIP712_DOMAIN = {
  name: "CompliantPrivateTokenDemo",
  version: "0.0.1",
  chainId: CHAIN_ID,
  verifyingContract: VAULT as `0x${string}`,
} as const;

// Deposit amounts
const DEPOSIT_1 = parseEther("2");
const DEPOSIT_2 = parseEther("1");
const TRANSFER_AMOUNT = parseEther("1");

// Project root for CRE invocation
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");
const CRE_BIN = `${process.env.HOME}/.cre/bin/cre`;

// ─── ABI fragments ───────────────────────────────────────────────────────────

const simpleTokenAbi = [
  {
    name: "mint",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

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

const walletClient = createWalletClient({
  account: ownerAccount,
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
 * Uses viem's signTypedData (async — fine for E2E test, unlike CRE WASM).
 */
async function fetchApiTransactions(): Promise<
  { id: string; type: string; tx_hash?: string; is_incoming?: boolean; token?: string; recipient?: string }[]
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
    recipient?: string;
  }[];
}

/**
 * Execute a private transfer via POST /private-transfer.
 * Returns the API transaction_id.
 */
async function executePrivateTransfer(
  recipient: Address,
  amount: bigint,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);

  const signature = await ownerAccount.signTypedData({
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
      sender: ownerAddr,
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
      account: ownerAddr,
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
  console.log(`  Private transfer submitted: transaction_id=${data.transaction_id}`);
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
  console.log(`  Owner:        ${ownerAddr}`);
  console.log(`  Bidder:       ${bidderAddr}`);
  console.log(`  Token (DEMO): ${SIMPLE_TOKEN}`);
  console.log(`  Vault:        ${VAULT}`);
  console.log(`  API:          ${PRIVATE_TOKEN_API}`);
  console.log(`  Supabase:     ${SUPABASE_URL}`);

  // ── Step 1: Mint DEMO tokens ──────────────────────────────────────────────
  step("Mint DEMO tokens to owner");
  const mintAmount = DEPOSIT_1 + DEPOSIT_2 + parseEther("1"); // extra buffer
  const mintHash = await walletClient.writeContract({
    address: SIMPLE_TOKEN,
    abi: simpleTokenAbi,
    functionName: "mint",
    args: [ownerAddr, mintAmount],
  });
  await waitForTx(mintHash, "mint");

  const balance = await publicClient.readContract({
    address: SIMPLE_TOKEN,
    abi: simpleTokenAbi,
    functionName: "balanceOf",
    args: [ownerAddr],
  });
  console.log(`  Owner DEMO balance: ${formatEther(balance)}`);

  // ── Step 2: Approve vault + deposit 2 DEMO ────────────────────────────────
  step("Approve vault and deposit 2 DEMO");
  const approveHash = await walletClient.writeContract({
    address: SIMPLE_TOKEN,
    abi: simpleTokenAbi,
    functionName: "approve",
    args: [VAULT, DEPOSIT_1 + DEPOSIT_2],
  });
  await waitForTx(approveHash, "approve");

  const deposit1Hash = await walletClient.writeContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "deposit",
    args: [SIMPLE_TOKEN, DEPOSIT_1],
  });
  const receipt1 = await waitForTx(deposit1Hash, "deposit #1 (2 DEMO)");
  console.log(`  Deposit #1 tx_hash: ${deposit1Hash}`);

  // ── Step 3: Deposit 1 more DEMO ───────────────────────────────────────────
  step("Deposit 1 more DEMO");
  const deposit2Hash = await walletClient.writeContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "deposit",
    args: [SIMPLE_TOKEN, DEPOSIT_2],
  });
  const receipt2 = await waitForTx(deposit2Hash, "deposit #2 (1 DEMO)");
  console.log(`  Deposit #2 tx_hash: ${deposit2Hash}`);

  // ── Step 4: Poll API until both deposits appear ───────────────────────────
  step("Poll Private Token API for both deposits");

  const { apiTxId1, apiTxId2 } = await poll(
    async () => {
      const txs = await fetchApiTransactions();
      const deposits = txs.filter((t) => t.type === "deposit");
      const d1 = deposits.find(
        (t) => t.tx_hash?.toLowerCase() === deposit1Hash.toLowerCase(),
      );
      const d2 = deposits.find(
        (t) => t.tx_hash?.toLowerCase() === deposit2Hash.toLowerCase(),
      );
      if (d1 && d2) {
        return { apiTxId1: d1.id, apiTxId2: d2.id };
      }
      console.log(`  Found ${deposits.length} deposits, waiting for both tx_hashes...`);
      return null;
    },
    "both deposits in API",
    30,
    10_000,
  );

  console.log(`  ✓ Deposit #1 API tx_id: ${apiTxId1}`);
  console.log(`  ✓ Deposit #2 API tx_id: ${apiTxId2}`);

  // ── Step 5: Run CRE deposit-reconciler simulation ─────────────────────────
  step("Run CRE deposit-reconciler simulation (first run)");
  runCRESimulation();

  // ── Step 6: Verify Supabase has both deposits ─────────────────────────────
  step("Verify deposits in Supabase");

  const { data: dep1 } = await supabase
    .from("deposits")
    .select("*")
    .eq("transaction_id", apiTxId1)
    .single();
  assert(!!dep1, `Deposit #1 (${apiTxId1}) not found in Supabase`);
  console.log(`  ✓ Deposit #1: amount=${dep1!.amount}, status=${dep1!.status}`);

  const { data: dep2 } = await supabase
    .from("deposits")
    .select("*")
    .eq("transaction_id", apiTxId2)
    .single();
  assert(!!dep2, `Deposit #2 (${apiTxId2}) not found in Supabase`);
  console.log(`  ✓ Deposit #2: amount=${dep2!.amount}, status=${dep2!.status}`);

  // ── Step 7: Check balances VIEW ───────────────────────────────────────────
  step("Check balances VIEW");
  const { data: balBefore } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", ownerAddr.toLowerCase())
    .single();
  assert(!!balBefore, "Balance not found in balances VIEW");
  console.log(`  Available balance: ${formatEther(BigInt(balBefore!.available_balance!))} DEMO`);
  console.log(`  Locked balance:    ${formatEther(BigInt(balBefore!.locked_balance!))} DEMO`);
  console.log(`  Pending withdrawal: ${formatEther(BigInt(balBefore!.pending_withdrawal!))} DEMO`);

  // The available balance should include at least our 3 DEMO (may have more from prior runs)
  const availBefore = BigInt(balBefore!.available_balance!);
  assert(availBefore >= DEPOSIT_1 + DEPOSIT_2, `Available balance ${availBefore} < expected ${DEPOSIT_1 + DEPOSIT_2}`);
  console.log(`  ✓ Available balance includes our 3 DEMO deposits`);

  // ── Step 8: Idempotency check — run CRE again ─────────────────────────────
  step("Idempotency check — run CRE simulation again");
  const { count: countBefore } = await supabase
    .from("deposits")
    .select("*", { count: "exact", head: true })
    .eq("user_address", ownerAddr.toLowerCase());

  runCRESimulation();

  const { count: countAfter } = await supabase
    .from("deposits")
    .select("*", { count: "exact", head: true })
    .eq("user_address", ownerAddr.toLowerCase());
  assert(countBefore === countAfter, `Deposit count changed: ${countBefore} → ${countAfter}`);
  console.log(`  ✓ Deposit count unchanged (${countAfter}) — idempotency works`);

  // ── Step 9: Private transfer 1 DEMO to bidder (outgoing from platform) ────
  step("Private transfer 1 DEMO to bidder address");
  const transferTxId = await executePrivateTransfer(bidderAddr, TRANSFER_AMOUNT);
  console.log(`  Transfer transaction_id: ${transferTxId}`);

  // ── Step 10: Poll API until outgoing transfer appears ─────────────────────
  step("Poll API for outgoing transfer");
  await poll(
    async () => {
      const txs = await fetchApiTransactions();
      const found = txs.find(
        (t) =>
          t.type === "transfer" &&
          t.id === transferTxId,
      );
      if (found) {
        console.log(`  ✓ Found outgoing transfer: id=${found.id}, is_incoming=${found.is_incoming}`);
        return found;
      }
      console.log(`  Transfer ${transferTxId} not yet visible...`);
      return null;
    },
    "outgoing transfer in API",
    30,
    10_000,
  );

  // ── Step 11: Run CRE simulation to pick up the transfer ───────────────────
  step("Run CRE simulation (picks up outgoing transfer)");
  runCRESimulation();

  // ── Step 12: Verify transfers table has the record ─────────────────────────
  step("Verify transfer in Supabase");
  const { data: transfer } = await supabase
    .from("transfers")
    .select("*")
    .eq("transaction_id", transferTxId)
    .single();
  assert(!!transfer, `Transfer ${transferTxId} not found in Supabase`);
  console.log(`  ✓ Transfer: amount=${transfer!.amount}, status=${transfer!.status}, type=${transfer!.type}`);

  // ── Step 13: Check balances VIEW — available decreased ─────────────────────
  step("Check balances VIEW after transfer");
  const { data: balAfter } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", ownerAddr.toLowerCase())
    .single();
  assert(!!balAfter, "Balance not found after transfer");

  const availAfter = BigInt(balAfter!.available_balance!);
  console.log(`  Available balance before: ${formatEther(availBefore)} DEMO`);
  console.log(`  Available balance after:  ${formatEther(availAfter)} DEMO`);
  console.log(`  Difference:               ${formatEther(availBefore - availAfter)} DEMO`);

  assert(
    availAfter < availBefore,
    `Balance did not decrease after transfer: ${availBefore} → ${availAfter}`,
  );
  assert(
    availBefore - availAfter === TRANSFER_AMOUNT,
    `Balance decreased by ${availBefore - availAfter}, expected ${TRANSFER_AMOUNT}`,
  );
  console.log(`  ✓ Balance decreased by exactly ${formatEther(TRANSFER_AMOUNT)} DEMO`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║     ALL TESTS PASSED ✓                              ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  Deposit #1:  ${apiTxId1}`);
  console.log(`║  Deposit #2:  ${apiTxId2}`);
  console.log(`║  Transfer:    ${transferTxId}`);
  console.log(`║  Balance:     ${formatEther(availBefore)} → ${formatEther(availAfter)} DEMO`);
  console.log("╚══════════════════════════════════════════════════════╝");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✗ E2E test failed:", err);
    process.exit(1);
  });
