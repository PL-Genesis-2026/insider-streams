/**
 * Private Token API Client — E2E Smoke Test
 *
 * Exercises all 5 API endpoints against the live Compliant Private Token API
 * on Ethereum Sepolia. Uses 1 wei transfers/withdrawals (negligible value).
 *
 * Env vars required:
 *   OWNER_PK   — Private key of the owner wallet (0x-prefixed)
 *   TESTER_PK  — Private key of the tester wallet (0x-prefixed, must differ from OWNER_PK)
 *
 * Usage:
 *   npx tsx packages/chainlink-private-token-api-client/e2e_tests/smoke-test.ts
 *
 * Or from the package directory:
 *   pnpm e2e
 */

import { CONFIDENTIAL_USDC_ADDRESS } from "@private-streams/common";
import { PrivateTokenApiClient } from "../src/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function envRequired(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`ERROR: ${name} not set`);
    process.exit(1);
  }
  return val;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const ownerPk = envRequired("OWNER_PK");
  const testerPk = envRequired("TESTER_PK");

  const owner = new PrivateTokenApiClient(ownerPk);
  const tester = new PrivateTokenApiClient(testerPk);

  if (owner.account === tester.account) {
    console.error("ERROR: OWNER_PK and TESTER_PK must be different accounts");
    process.exit(1);
  }

  console.log(`Owner:  ${owner.account}`);
  console.log(`Tester: ${tester.account}`);
  console.log(`Token:  ${CONFIDENTIAL_USDC_ADDRESS}\n`);

  // 1. getBalances
  console.log("─── 1/5 getBalances ───");
  const ownerBal = await owner.getBalances();
  console.log("Owner balances:", JSON.stringify(ownerBal));
  assert(Array.isArray(ownerBal.balances), "balances should be an array");
  console.log("PASS\n");

  // 2. listTransactions
  console.log("─── 2/5 listTransactions ───");
  const txns = await owner.listTransactions({ limit: 3 });
  console.log("Owner transactions:", JSON.stringify(txns));
  assert(Array.isArray(txns.transactions), "transactions should be an array");
  assert(typeof txns.has_more === "boolean", "has_more should be boolean");
  console.log("PASS\n");

  // 3. generateShieldedAddress
  console.log("─── 3/5 generateShieldedAddress ───");
  const shielded = await tester.generateShieldedAddress();
  console.log("Tester shielded address:", JSON.stringify(shielded));
  assert(typeof shielded.address === "string", "address should be a string");
  console.log("PASS\n");

  // 4. privateTransfer (1 wei of DEMO token)
  console.log("─── 4/5 privateTransfer ───");
  const transfer = await owner.privateTransfer({
    recipient: tester.account,
    token: CONFIDENTIAL_USDC_ADDRESS,
    amount: "1",
  });
  console.log("Private transfer:", JSON.stringify(transfer));
  assert(
    typeof transfer.transaction_id === "string",
    "transfer should have transaction_id",
  );
  console.log("PASS\n");

  // 5. withdraw (1 wei of DEMO token)
  console.log("─── 5/5 withdraw ───");
  const withdrawal = await tester.withdraw({
    token: CONFIDENTIAL_USDC_ADDRESS,
    amount: "1",
  });
  console.log("Withdraw:", JSON.stringify(withdrawal));
  assert(typeof withdrawal.id === "string", "withdraw should have id");
  assert(typeof withdrawal.ticket === "string", "withdraw should have ticket");
  assert(
    typeof withdrawal.deadline === "number",
    "withdraw should have deadline",
  );
  console.log("PASS\n");

  console.log("All 5 endpoint smoke tests passed");
}

main().catch((e) => {
  console.error("Smoke test failed:", e);
  process.exit(1);
});
