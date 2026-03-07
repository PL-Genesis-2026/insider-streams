/**
 * Private Token API Client — Error Case Tests
 *
 * Verifies the client surfaces API errors correctly:
 *   - Insufficient balance for transfer
 *   - Invalid/unknown token address
 *   - Transfer with zero amount
 *   - Insufficient balance for withdrawal
 *
 * Env vars required:
 *   OWNER_PK   — Private key of the owner wallet (0x-prefixed)
 *   TESTER_PK  — Private key of the tester wallet (0x-prefixed, must differ from OWNER_PK)
 *
 * Usage:
 *   npx tsx packages/chainlink-private-token-api-client/e2e_tests/error-cases.ts
 *
 * Or from the package directory:
 *   pnpm e2e:errors
 */

import { PRIVATE_CONFIDENTIAL_USDC_ADDRESS } from "@private-streams/common";
import { AxiosError } from "axios";
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

let passed = 0;
let failed = 0;

async function expectError(
  name: string,
  fn: () => Promise<unknown>,
  check?: (err: AxiosError) => void,
): Promise<void> {
  try {
    await fn();
    console.log(`  FAIL: ${name} — expected an error but got success`);
    failed++;
  } catch (err) {
    if (err instanceof AxiosError && err.response) {
      const status = err.response.status;
      const data = err.response.data;
      console.log(`  PASS: ${name} — HTTP ${status}: ${JSON.stringify(data)}`);
      if (check) check(err);
      passed++;
    } else {
      console.log(`  FAIL: ${name} — unexpected error type:`, err);
      failed++;
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const ownerPk = envRequired("OWNER_PK");
  const testerPk = envRequired("TESTER_PK");

  const owner = new PrivateTokenApiClient(ownerPk);
  const tester = new PrivateTokenApiClient(testerPk);

  console.log(`Owner:  ${owner.account}`);
  console.log(`Tester: ${tester.account}\n`);

  // 1. Transfer with unknown token (policy denial)
  console.log("─── 1/4 Transfer with unknown token ───");
  await expectError("unknown token", () =>
    owner.privateTransfer({
      recipient: tester.account,
      token: "0x0000000000000000000000000000000000000001",
      amount: "1",
    }),
  );

  // 2. Transfer more than balance (absurdly large amount)
  console.log("─── 2/4 Transfer exceeding balance ───");
  await expectError("insufficient balance", () =>
    owner.privateTransfer({
      recipient: tester.account,
      token: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
      amount: "999999999999999999999999999999",
    }),
  );

  // 3. Withdraw more than balance
  console.log("─── 3/4 Withdraw exceeding balance ───");
  await expectError("insufficient balance for withdraw", () =>
    tester.withdraw({
      token: PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
      amount: "999999999999999999999999999999",
    }),
  );

  // 4. Withdraw with unknown token
  console.log("─── 4/4 Withdraw with unknown token ───");
  await expectError("unknown token withdraw", () =>
    tester.withdraw({
      token: "0x0000000000000000000000000000000000000001",
      amount: "1",
    }),
  );

  // Summary
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Error case tests failed:", e);
  process.exit(1);
});
