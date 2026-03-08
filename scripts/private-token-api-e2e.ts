#!/usr/bin/env tsx

import { config as loadEnv } from "dotenv";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRIVATE_CONFIDENTIAL_USDC_ADDRESS } from "@private-streams/common";
import { PrivateTokenApiClient } from "@private-streams/chainlink-private-token-api-client";

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const frontendDir = resolve(repoRoot, "apps/insider-streams-frontend");

loadEnv({ path: resolve(repoRoot, ".env"), quiet: true });
loadEnv({ path: resolve(frontendDir, ".env.local"), quiet: true });
loadEnv({ path: resolve(scriptDir, ".env"), override: true, quiet: true });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function requiredOneOf(...names: string[]): { key: string; value: string } {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return { key: name, value };
    }
  }

  console.error(`Missing required env var. Tried: ${names.join(", ")}`);
  process.exit(1);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function runCli(args: string[]) {
  const { stdout, stderr } = await execFileAsync(
    "pnpm",
    ["--dir", "scripts", "exec", "tsx", "private-token-api.ts", ...args],
    { cwd: repoRoot },
  );

  if (stderr.trim().length > 0) {
    console.error(stderr);
  }

  return JSON.parse(stdout) as {
    command: string;
    account: string;
    result: unknown;
  };
}

async function main(): Promise<void> {
  const ownerPk = requiredEnv("OWNER_PK");
  const testerSigner = requiredOneOf(
    "TESTER_PK",
    "BIDDER_PK",
    "PLAYWRIGHT_WALLET_PRIVATE_KEY",
  );

  const owner = new PrivateTokenApiClient(ownerPk);
  const tester = new PrivateTokenApiClient(testerSigner.value);

  console.log(`Owner:  ${owner.account}`);
  console.log(`Tester: ${tester.account}`);
  console.log(`Token:  ${PRIVATE_CONFIDENTIAL_USDC_ADDRESS}\n`);

  console.log("1/5 balances");
  const balances = await runCli(["balances"]);
  assert(balances.command === "balances", "balances command name mismatch");
  assert(balances.account === owner.account, "balances account mismatch");
  assert(
    Array.isArray((balances.result as { balances?: unknown }).balances),
    "balances result must contain a balances array",
  );

  console.log("2/5 transactions");
  const transactions = await runCli(["transactions", "--limit", "3"]);
  assert(transactions.command === "transactions", "transactions command name mismatch");
  assert(transactions.account === owner.account, "transactions account mismatch");
  assert(
    Array.isArray((transactions.result as { transactions?: unknown }).transactions),
    "transactions result must contain a transactions array",
  );

  console.log("3/5 shielded-address");
  const shieldedAddress = await runCli([
    "shielded-address",
    "--env-key",
    testerSigner.key,
  ]);
  assert(
    shieldedAddress.command === "shielded-address",
    "shielded-address command name mismatch",
  );
  assert(
    shieldedAddress.account === tester.account,
    "shielded-address account mismatch",
  );
  assert(
    typeof (shieldedAddress.result as { address?: unknown }).address === "string",
    "shielded-address result must contain an address string",
  );

  console.log("4/5 transfer");
  const transfer = await runCli([
    "transfer",
    "--recipient",
    tester.account,
    "--amount",
    "1",
  ]);
  assert(transfer.command === "transfer", "transfer command name mismatch");
  assert(transfer.account === owner.account, "transfer account mismatch");
  assert(
    typeof (transfer.result as { transaction_id?: unknown }).transaction_id === "string",
    "transfer result must contain transaction_id",
  );

  console.log("5/5 withdraw");
  const withdraw = await runCli([
    "withdraw",
    "--env-key",
    testerSigner.key,
    "--amount",
    "1",
  ]);
  assert(withdraw.command === "withdraw", "withdraw command name mismatch");
  assert(withdraw.account === tester.account, "withdraw account mismatch");
  assert(typeof (withdraw.result as { id?: unknown }).id === "string", "withdraw result must contain id");
  assert(
    typeof (withdraw.result as { ticket?: unknown }).ticket === "string",
    "withdraw result must contain ticket",
  );

  console.log("\nPrivate token CLI e2e passed");
}

main().catch((error) => {
  console.error("Private token CLI e2e failed:", error);
  process.exit(1);
});
