#!/usr/bin/env tsx

import { config as loadEnv } from "dotenv";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import { type Hex } from "viem";

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const frontendDir = resolve(repoRoot, "apps/insider-streams-frontend");

[
  resolve(repoRoot, ".env"),
  resolve(frontendDir, ".env.local"),
  resolve(scriptDir, ".env"),
].forEach((path, index) => {
  loadEnv({ path, override: index > 0, quiet: true });
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function runCli(args: string[]) {
  const { stdout, stderr } = await execFileAsync(
    "pnpm",
    ["--dir", "scripts", "exec", "tsx", "frontend-api.ts", ...args],
    { cwd: repoRoot },
  );

  if (stderr.trim().length > 0) {
    console.error(stderr);
  }

  return JSON.parse(stdout) as {
    command: string;
    data: unknown;
    ok: boolean;
    status: number;
    url: string;
  };
}

async function main(): Promise<void> {
  const ownerPk = requiredEnv("OWNER_PK");
  const owner = privateKeyToAccount(
    (ownerPk.startsWith("0x") ? ownerPk : `0x${ownerPk}`) as Hex,
  );

  console.log(`Owner: ${owner.address}\n`);

  console.log("1/3 events");
  const events = await runCli(["events"]);
  assert(events.command === "events", "events command name mismatch");
  assert(events.ok, "events request failed");
  assert(events.status === 200, "events status mismatch");
  assert(
    Array.isArray((events.data as { events?: unknown }).events),
    "events result must contain an events array",
  );

  console.log("2/3 snapshot");
  const snapshot = await runCli(["snapshot", "--address", owner.address]);
  assert(snapshot.command === "snapshot", "snapshot command name mismatch");
  assert(snapshot.ok, "snapshot request failed");
  assert(snapshot.status === 200, "snapshot status mismatch");
  assert(
    typeof (snapshot.data as { data?: unknown }).data === "object",
    "snapshot result must contain a data object",
  );

  console.log("3/3 private-balances");
  const balances = await runCli(["private-balances"]);
  assert(
    balances.command === "private-balances",
    "private-balances command name mismatch",
  );
  assert(balances.ok, "private-balances request failed");
  assert(balances.status === 200, "private-balances status mismatch");
  assert(
    Array.isArray((balances.data as { balances?: unknown }).balances),
    "private-balances result must contain a balances array",
  );

  console.log("\nFrontend API CLI e2e passed");
}

main().catch((error) => {
  console.error("Frontend API CLI e2e failed:", error);
  process.exit(1);
});
