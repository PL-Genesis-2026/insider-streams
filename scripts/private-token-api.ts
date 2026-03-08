#!/usr/bin/env tsx

import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PRIVATE_CONFIDENTIAL_USDC_ADDRESS } from "@private-streams/common";
import { PrivateTokenApiClient } from "@private-streams/chainlink-private-token-api-client";

type Command =
  | "balances"
  | "transactions"
  | "shielded-address"
  | "transfer"
  | "withdraw";

type CommonOptions = {
  baseUrl?: string;
  envKey?: string;
  help?: boolean;
  pk?: string;
};

type CommandResult = unknown;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const frontendDir = resolve(repoRoot, "apps/insider-streams-frontend");
const DEFAULT_SIGNER_ENV_KEY = "OWNER_PK";
const LOCAL_ENV_PATHS = [
  resolve(repoRoot, ".env"),
  resolve(frontendDir, ".env.local"),
  resolve(scriptDir, ".env"),
] as const;

LOCAL_ENV_PATHS.forEach((path, index) => {
  loadEnv({ path, override: index > 0, quiet: true });
});

const COMMAND_DESCRIPTIONS: Record<Command, string> = {
  balances: "Get private token balances for the signing account.",
  transactions: "List private token transactions for the signing account.",
  "shielded-address": "Generate a new shielded address for the signing account.",
  transfer: "Send a private transfer from the signing account.",
  withdraw: "Create a withdrawal ticket for the signing account.",
};

function usage(): string {
  return `Usage:
  pnpm private-token-api <command> [options]

Commands:
  balances           ${COMMAND_DESCRIPTIONS.balances}
  transactions       ${COMMAND_DESCRIPTIONS.transactions}
  shielded-address   ${COMMAND_DESCRIPTIONS["shielded-address"]}
  transfer           ${COMMAND_DESCRIPTIONS.transfer}
  withdraw           ${COMMAND_DESCRIPTIONS.withdraw}

Common options:
  --pk <hex>         Private key to use for signing
  --env-key <name>   Env var to read the private key from (default: ${DEFAULT_SIGNER_ENV_KEY})
  --base-url <url>   Override the private token API base URL
  --help             Show command help

Command options:
  transactions --limit <n> [--cursor <cursor>]
  transfer --recipient <address> --amount <base-units> [--token <address>] [--flag <value> ...]
  withdraw --amount <base-units> [--token <address>]

Environment:
  OWNER_PK                   Default signer if --pk / --env-key are omitted
  BIDDER_PK                  Alternate signer available in scripts/.env
  PLAYWRIGHT_WALLET_PRIVATE_KEY Alternate signer available in apps/insider-streams-frontend/.env.local
  PRIVATE_TOKEN_API_BASE_URL Optional default API base URL

Examples:
  pnpm private-token-api balances
  pnpm private-token-api transactions --limit 20 --env-key BIDDER_PK
  pnpm private-token-api shielded-address --env-key BIDDER_PK
  pnpm private-token-api transfer --recipient 0xabc... --amount 1000000
  pnpm private-token-api withdraw --env-key BIDDER_PK --amount 500000 --token ${PRIVATE_CONFIDENTIAL_USDC_ADDRESS}
`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function validateAddress(value: string, fieldName: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    fail(`${fieldName} must be a 20-byte 0x-prefixed address`);
  }
  return value;
}

function validateAmount(value: string): string {
  if (!/^\d+$/.test(value)) {
    fail("amount must be a base-unit integer string");
  }

  if (BigInt(value) <= 0n) {
    fail("amount must be greater than zero");
  }

  return value;
}

function normalizePrivateKey(value: string): string {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    fail("private key must be a 32-byte hex string");
  }
  return normalized;
}

function getPrivateKey(common: CommonOptions): string {
  if (common.pk) {
    return normalizePrivateKey(common.pk);
  }

  const envKey = common.envKey ?? DEFAULT_SIGNER_ENV_KEY;
  const fromEnv = process.env[envKey];
  if (!fromEnv) {
    fail(`missing private key: pass --pk or set ${envKey}`);
  }

  return normalizePrivateKey(fromEnv);
}

function getBaseUrl(common: CommonOptions): string | undefined {
  return common.baseUrl ?? process.env.PRIVATE_TOKEN_API_BASE_URL;
}

function createClient(common: CommonOptions): PrivateTokenApiClient {
  return new PrivateTokenApiClient(getPrivateKey(common), getBaseUrl(common));
}

function printResult(command: Command, client: PrivateTokenApiClient, result: CommandResult): void {
  console.log(
    JSON.stringify(
      {
        command,
        account: client.account,
        result,
      },
      null,
      2,
    ),
  );
}

function parseCommand(argv: string[]): { command: Command; args: string[] } {
  const [command, ...args] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    process.exit(0);
  }

  if (!(command in COMMAND_DESCRIPTIONS)) {
    fail(`unknown command "${command}"\n\n${usage()}`);
  }

  return { command: command as Command, args };
}

function parseCommonOptions(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      pk: { type: "string" },
      "env-key": { type: "string" },
      "base-url": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  }).values;
}

function toCommonOptions(
  values: ReturnType<typeof parseCommonOptions>,
): CommonOptions {
  return {
    pk: values.pk,
    envKey: values["env-key"],
    baseUrl: values["base-url"],
    help: values.help,
  };
}

async function runBalances(args: string[]): Promise<void> {
  const common = toCommonOptions(parseCommonOptions(args));
  if (common.help) {
    console.log("Usage: pnpm private-token-api balances [--pk <hex>] [--env-key <name>] [--base-url <url>]");
    return;
  }

  const client = createClient(common);
  printResult("balances", client, await client.getBalances());
}

async function runTransactions(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      pk: { type: "string" },
      "env-key": { type: "string" },
      "base-url": { type: "string" },
      help: { type: "boolean", short: "h" },
      limit: { type: "string" },
      cursor: { type: "string" },
    },
  });

  if (parsed.values.help) {
    console.log("Usage: pnpm private-token-api transactions [--limit <n>] [--cursor <cursor>] [--pk <hex>] [--env-key <name>] [--base-url <url>]");
    return;
  }

  const limitValue = parsed.values.limit;
  let limit: number | undefined;

  if (limitValue !== undefined) {
    if (!/^\d+$/.test(limitValue)) {
      fail("limit must be a positive integer");
    }

    limit = Number.parseInt(limitValue, 10);
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      fail("limit must be a positive safe integer");
    }
  }

  const client = createClient(toCommonOptions(parsed.values));
  printResult(
    "transactions",
    client,
    await client.listTransactions({
      limit,
      cursor: parsed.values.cursor,
    }),
  );
}

function normalizeFlags(flags: string[] | undefined): string[] {
  if (!flags) {
    return [];
  }

  return flags.flatMap((flag) =>
    flag
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

async function runShieldedAddress(args: string[]): Promise<void> {
  const common = toCommonOptions(parseCommonOptions(args));
  if (common.help) {
    console.log("Usage: pnpm private-token-api shielded-address [--pk <hex>] [--env-key <name>] [--base-url <url>]");
    return;
  }

  const client = createClient(common);
  printResult("shielded-address", client, await client.generateShieldedAddress());
}

async function runTransfer(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      pk: { type: "string" },
      "env-key": { type: "string" },
      "base-url": { type: "string" },
      help: { type: "boolean", short: "h" },
      recipient: { type: "string" },
      token: { type: "string" },
      amount: { type: "string" },
      flag: { type: "string", multiple: true },
    },
  });

  if (parsed.values.help) {
    console.log("Usage: pnpm private-token-api transfer --recipient <address> --amount <base-units> [--token <address>] [--flag <value> ...] [--pk <hex>] [--env-key <name>] [--base-url <url>]");
    return;
  }

  const recipient = parsed.values.recipient;
  const amount = parsed.values.amount;

  if (!recipient) {
    fail("missing required argument: --recipient");
  }

  if (!amount) {
    fail("missing required argument: --amount");
  }

  const client = createClient(toCommonOptions(parsed.values));
  printResult(
    "transfer",
    client,
    await client.privateTransfer({
      recipient: validateAddress(recipient, "recipient"),
      token: validateAddress(
        parsed.values.token ?? PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
        "token",
      ),
      amount: validateAmount(amount),
      flags: normalizeFlags(parsed.values.flag),
    }),
  );
}

async function runWithdraw(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      pk: { type: "string" },
      "env-key": { type: "string" },
      "base-url": { type: "string" },
      help: { type: "boolean", short: "h" },
      token: { type: "string" },
      amount: { type: "string" },
    },
  });

  if (parsed.values.help) {
    console.log("Usage: pnpm private-token-api withdraw --amount <base-units> [--token <address>] [--pk <hex>] [--env-key <name>] [--base-url <url>]");
    return;
  }

  const amount = parsed.values.amount;
  if (!amount) {
    fail("missing required argument: --amount");
  }

  const client = createClient(toCommonOptions(parsed.values));
  printResult(
    "withdraw",
    client,
    await client.withdraw({
      token: validateAddress(
        parsed.values.token ?? PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
        "token",
      ),
      amount: validateAmount(amount),
    }),
  );
}

function printError(error: unknown): never {
  if (error instanceof Error) {
    console.error(error.message);

    const maybeResponse = error as Error & {
      response?: {
        status?: number;
        data?: unknown;
      };
    };

    if (maybeResponse.response) {
      if (typeof maybeResponse.response.status === "number") {
        console.error(`HTTP ${maybeResponse.response.status}`);
      }
      if (maybeResponse.response.data !== undefined) {
        console.error(JSON.stringify(maybeResponse.response.data, null, 2));
      }
    }
  } else {
    console.error(String(error));
  }

  process.exit(1);
}

const { command, args } = parseCommand(process.argv.slice(2));

const runners: Record<Command, (commandArgs: string[]) => Promise<void>> = {
  balances: runBalances,
  transactions: runTransactions,
  "shielded-address": runShieldedAddress,
  transfer: runTransfer,
  withdraw: runWithdraw,
};

runners[command](args).catch(printError);
