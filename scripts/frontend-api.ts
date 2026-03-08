#!/usr/bin/env tsx

import { config as loadEnv } from "dotenv";
import stringify from "fast-json-stable-stringify";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  CONFIDENTIAL_USDC_FAUCET_ACTION,
  CREATE_AUCTION_DURATIONS,
  CREATE_AUCTION_EIP712_DOMAIN,
  CREATE_AUCTION_EIP712_TYPES,
  PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
  VAULT_ADDRESS,
} from "@private-streams/common";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, isAddress, type Hex } from "viem";
import { sepolia } from "viem/chains";

type Command =
  | "events"
  | "secrets"
  | "snapshot"
  | "reconcile"
  | "private-balances"
  | "private-transfer"
  | "faucet"
  | "bid"
  | "create-auction";

type CommonOptions = {
  baseUrl?: string;
  envKey?: string;
  help?: boolean;
  pk?: string;
};

type JsonResponse = {
  data: unknown;
  ok: boolean;
  status: number;
  url: string;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const frontendDir = resolve(repoRoot, "apps/insider-streams-frontend");
const DEFAULT_SIGNER_ENV_KEY = "OWNER_PK";
const DEFAULT_BASE_URL = "http://localhost:3000";

[
  resolve(repoRoot, ".env"),
  resolve(frontendDir, ".env.local"),
  resolve(scriptDir, ".env"),
].forEach((path, index) => {
  loadEnv({ path, override: index > 0, quiet: true });
});

const PRIVATE_TOKEN_EIP712_DOMAIN = {
  name: "CompliantPrivateTokenDemo" as const,
  version: "0.0.1" as const,
  chainId: 11155111,
  verifyingContract: VAULT_ADDRESS as Hex,
};

const COMMAND_DESCRIPTIONS: Record<Command, string> = {
  events: "List open prediction market events.",
  secrets: "Fetch secret payloads by auction id.",
  snapshot: "Fetch funding snapshot for a wallet.",
  reconcile: "Reconcile funding history for a wallet.",
  "private-balances": "Call the Next private balances route.",
  "private-transfer": "Call the Next private transfer route.",
  faucet: "Call the Next confidential USDC faucet route.",
  bid: "Call the Next bid route.",
  "create-auction": "Call the Next create-auction route.",
};

function usage(): string {
  return `Usage:
  pnpm frontend-api <command> [options]

Commands:
  events             ${COMMAND_DESCRIPTIONS.events}
  secrets            ${COMMAND_DESCRIPTIONS.secrets}
  snapshot           ${COMMAND_DESCRIPTIONS.snapshot}
  reconcile          ${COMMAND_DESCRIPTIONS.reconcile}
  private-balances   ${COMMAND_DESCRIPTIONS["private-balances"]}
  private-transfer   ${COMMAND_DESCRIPTIONS["private-transfer"]}
  faucet             ${COMMAND_DESCRIPTIONS.faucet}
  bid                ${COMMAND_DESCRIPTIONS.bid}
  create-auction     ${COMMAND_DESCRIPTIONS["create-auction"]}

Common options:
  --base-url <url>   Frontend origin (default: ${DEFAULT_BASE_URL})
  --pk <hex>         Private key to use for signing
  --env-key <name>   Env var holding the signer private key (default: ${DEFAULT_SIGNER_ENV_KEY})
  --help             Show command help

Command options:
  events
  secrets --ids <csv>
  snapshot [--pk <hex>] [--env-key <name>]
  reconcile [--pk <hex>] [--env-key <name>]
  private-balances [--pk <hex>] [--env-key <name>]
  private-transfer --recipient <address> --amount <base-units> [--token <address>] [--flag <value> ...]
  faucet [--address <address>] [--pk <hex>] [--env-key <name>]
  bid --auction-id <id> --amount <base-units> [--pk <hex>] [--env-key <name>]
  create-auction --event-id <id> --private-leg <yes|no> --secret-payload <text> --duration <${CREATE_AUCTION_DURATIONS.join("|")}> [--pk <hex>] [--env-key <name>]

Environment:
  FRONTEND_BASE_URL  Optional default frontend origin
  BASE_URL           Backwards-compatible frontend origin fallback
  OWNER_PK           Default signer
  BIDDER_PK          Common alternate signer in scripts/.env
  PLAYWRIGHT_WALLET_PRIVATE_KEY Alternate signer in apps/insider-streams-frontend/.env.local
`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function timestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function validateAddress(value: string, fieldName: string): string {
  if (!isAddress(value)) {
    fail(`${fieldName} must be a valid 0x address`);
  }
  return value;
}

function validateAmount(value: string, fieldName = "amount"): string {
  if (!/^\d+$/.test(value)) {
    fail(`${fieldName} must be a base-unit integer string`);
  }
  if (BigInt(value) <= 0n) {
    fail(`${fieldName} must be greater than zero`);
  }
  return value;
}

function validateNonNegativeIntegerString(value: string, fieldName: string): string {
  if (!/^\d+$/.test(value)) {
    fail(`${fieldName} must be a non-negative integer string`);
  }
  return value;
}

function normalizePrivateKey(value: string): Hex {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    fail("private key must be a 32-byte hex string");
  }
  return normalized as Hex;
}

function parseCommonOptions(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      "base-url": { type: "string" },
      "env-key": { type: "string" },
      help: { type: "boolean", short: "h" },
      pk: { type: "string" },
    },
  }).values;
}

function toCommonOptions(values: ReturnType<typeof parseCommonOptions>): CommonOptions {
  return {
    baseUrl: values["base-url"],
    envKey: values["env-key"],
    help: values.help,
    pk: values.pk,
  };
}

function getBaseUrl(common: CommonOptions): string {
  return (
    common.baseUrl ??
    process.env.FRONTEND_BASE_URL ??
    process.env.BASE_URL ??
    DEFAULT_BASE_URL
  );
}

function getPrivateKey(common: CommonOptions): Hex {
  if (common.pk) {
    return normalizePrivateKey(common.pk);
  }

  const envKey = common.envKey ?? DEFAULT_SIGNER_ENV_KEY;
  const value = process.env[envKey];
  if (!value) {
    fail(`missing private key: pass --pk or set ${envKey}`);
  }

  return normalizePrivateKey(value);
}

function getSigner(common: CommonOptions) {
  const account = privateKeyToAccount(getPrivateKey(common));
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(),
  });

  return { account, walletClient };
}

async function signStablePayload(
  common: CommonOptions,
  payload: Record<string, unknown>,
): Promise<{ payloadWithSignature: Record<string, unknown>; signerAddress: string }> {
  const { account, walletClient } = getSigner(common);
  const signature = await walletClient.signMessage({
    account,
    message: stringify(payload),
  });

  return {
    signerAddress: account.address,
    payloadWithSignature: {
      ...payload,
      signature,
    },
  };
}

async function signPrivateBalancesPayload(common: CommonOptions) {
  const { account, walletClient } = getSigner(common);
  const ts = timestamp();
  const auth = await walletClient.signTypedData({
    account,
    domain: PRIVATE_TOKEN_EIP712_DOMAIN,
    types: {
      "Retrieve Balances": [
        { name: "account", type: "address" },
        { name: "timestamp", type: "uint256" },
      ],
    },
    primaryType: "Retrieve Balances",
    message: {
      account: account.address,
      timestamp: BigInt(ts),
    },
  });

  return {
    account: account.address,
    auth,
    timestamp: ts,
  };
}

async function signPrivateTransferPayload(
  common: CommonOptions,
  recipient: Hex,
  token: Hex,
  amount: string,
  flags: string[],
) {
  const { account, walletClient } = getSigner(common);
  const ts = timestamp();
  const auth = await walletClient.signTypedData({
    account,
    domain: PRIVATE_TOKEN_EIP712_DOMAIN,
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
      sender: account.address,
      recipient,
      token,
      amount: BigInt(amount),
      flags,
      timestamp: BigInt(ts),
    },
  });

  return {
    account: account.address,
    recipient,
    token,
    amount,
    flags,
    timestamp: ts,
    auth,
  };
}

async function signCreateAuctionPayload(
  common: CommonOptions,
  payload: {
    duration: string;
    eventId: string;
    privateLeg: "yes" | "no";
    secretPayload: string;
  },
) {
  const { account, walletClient } = getSigner(common);
  const ts = timestamp();
  const signature = await walletClient.signTypedData({
    account,
    domain: CREATE_AUCTION_EIP712_DOMAIN,
    types: CREATE_AUCTION_EIP712_TYPES,
    primaryType: "CreateAuction",
    message: {
      eventId: payload.eventId,
      privateLeg: payload.privateLeg,
      duration: payload.duration,
      timestamp: BigInt(ts),
    },
  });

  return {
    eventId: payload.eventId,
    privateLeg: payload.privateLeg,
    secretPayload: payload.secretPayload,
    duration: payload.duration,
    timestamp: ts,
    signature,
  };
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

async function requestJson(
  common: CommonOptions,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<JsonResponse> {
  const url = `${getBaseUrl(common)}${path}`;
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data: unknown = text;

  try {
    data = JSON.parse(text);
  } catch {
    // Keep raw text when the response is not JSON.
  }

  return {
    data,
    ok: response.ok,
    status: response.status,
    url,
  };
}

function printResponse(command: Command, response: JsonResponse): void {
  console.log(
    JSON.stringify(
      {
        command,
        ok: response.ok,
        status: response.status,
        url: response.url,
        data: response.data,
      },
      null,
      2,
    ),
  );
}

function exitOnHttpError(response: JsonResponse): void {
  if (!response.ok) {
    process.exit(1);
  }
}

async function runEvents(args: string[]): Promise<void> {
  const common = toCommonOptions(parseCommonOptions(args));
  if (common.help) {
    console.log("Usage: pnpm frontend-api events [--base-url <url>]");
    return;
  }

  const response = await requestJson(common, "GET", "/api/prediction-market/events");
  printResponse("events", response);
  exitOnHttpError(response);
}

async function runSecrets(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      "base-url": { type: "string" },
      help: { type: "boolean", short: "h" },
      ids: { type: "string" },
    },
  });

  if (parsed.values.help) {
    console.log("Usage: pnpm frontend-api secrets --ids <csv> [--base-url <url>]");
    return;
  }

  const ids = parsed.values.ids;
  if (!ids) {
    fail("missing required argument: --ids");
  }

  const response = await requestJson(
    { baseUrl: parsed.values["base-url"], help: parsed.values.help },
    "GET",
    `/api/secrets?ids=${encodeURIComponent(ids)}`,
  );
  printResponse("secrets", response);
  exitOnHttpError(response);
}

async function runSnapshot(args: string[]): Promise<void> {
  const common = toCommonOptions(parseCommonOptions(args));
  if (common.help) {
    console.log(
      "Usage: pnpm frontend-api snapshot [--pk <hex>] [--env-key <name>] [--base-url <url>]",
    );
    return;
  }

  const { payloadWithSignature } = await signStablePayload(common, {
    timestamp: timestamp(),
  });

  const response = await requestJson(
    common,
    "POST",
    "/api/funding/snapshot",
    payloadWithSignature,
  );
  printResponse("snapshot", response);
  exitOnHttpError(response);
}

async function runReconcile(args: string[]): Promise<void> {
  const common = toCommonOptions(parseCommonOptions(args));
  if (common.help) {
    console.log(
      "Usage: pnpm frontend-api reconcile [--pk <hex>] [--env-key <name>] [--base-url <url>]",
    );
    return;
  }

  const { payloadWithSignature } = await signStablePayload(common, {
    timestamp: timestamp(),
  });

  const response = await requestJson(
    common,
    "POST",
    "/api/funding/reconcile",
    payloadWithSignature,
  );
  printResponse("reconcile", response);
  exitOnHttpError(response);
}

async function runPrivateBalances(args: string[]): Promise<void> {
  const common = toCommonOptions(parseCommonOptions(args));
  if (common.help) {
    console.log(
      "Usage: pnpm frontend-api private-balances [--pk <hex>] [--env-key <name>] [--base-url <url>]",
    );
    return;
  }

  const response = await requestJson(
    common,
    "POST",
    "/api/private-token/balances",
    await signPrivateBalancesPayload(common),
  );
  printResponse("private-balances", response);
  exitOnHttpError(response);
}

async function runPrivateTransfer(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      "base-url": { type: "string" },
      "env-key": { type: "string" },
      amount: { type: "string" },
      flag: { type: "string", multiple: true },
      help: { type: "boolean", short: "h" },
      pk: { type: "string" },
      recipient: { type: "string" },
      token: { type: "string" },
    },
  });

  if (parsed.values.help) {
    console.log(
      "Usage: pnpm frontend-api private-transfer --recipient <address> --amount <base-units> [--token <address>] [--flag <value> ...] [--pk <hex>] [--env-key <name>] [--base-url <url>]",
    );
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

  const common = toCommonOptions(parsed.values);
  const response = await requestJson(
    common,
    "POST",
    "/api/private-token/private-transfer",
    await signPrivateTransferPayload(
      common,
      validateAddress(recipient, "recipient") as Hex,
      validateAddress(
        parsed.values.token ?? PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
        "token",
      ) as Hex,
      validateAmount(amount),
      normalizeFlags(parsed.values.flag),
    ),
  );
  printResponse("private-transfer", response);
  exitOnHttpError(response);
}

async function runFaucet(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      address: { type: "string" },
      "base-url": { type: "string" },
      "env-key": { type: "string" },
      help: { type: "boolean", short: "h" },
      pk: { type: "string" },
    },
  });

  if (parsed.values.help) {
    console.log(
      "Usage: pnpm frontend-api faucet [--address <address>] [--pk <hex>] [--env-key <name>] [--base-url <url>]",
    );
    return;
  }

  const common = toCommonOptions(parsed.values);
  const { account } = getSigner(common);
  const address = parsed.values.address
    ? validateAddress(parsed.values.address, "address")
    : account.address;

  if (address.toLowerCase() !== account.address.toLowerCase()) {
    fail("faucet address must match the signing wallet address");
  }

  const response = await requestJson(
    common,
    "POST",
    "/api/faucet/confidential-usdc",
    (
      await signStablePayload(common, {
        action: CONFIDENTIAL_USDC_FAUCET_ACTION,
        address,
        timestamp: timestamp(),
      })
    ).payloadWithSignature,
  );
  printResponse("faucet", response);
  exitOnHttpError(response);
}

async function runBid(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      amount: { type: "string" },
      "auction-id": { type: "string" },
      "base-url": { type: "string" },
      "env-key": { type: "string" },
      help: { type: "boolean", short: "h" },
      pk: { type: "string" },
    },
  });

  if (parsed.values.help) {
    console.log(
      "Usage: pnpm frontend-api bid --auction-id <id> --amount <base-units> [--pk <hex>] [--env-key <name>] [--base-url <url>]",
    );
    return;
  }

  const auctionId = parsed.values["auction-id"];
  const amount = parsed.values.amount;

  if (!auctionId) {
    fail("missing required argument: --auction-id");
  }
  if (!amount) {
    fail("missing required argument: --amount");
  }

  const common = toCommonOptions(parsed.values);
  const response = await requestJson(
    common,
    "POST",
    "/api/bid",
    (
      await signStablePayload(common, {
        auctionId: validateNonNegativeIntegerString(auctionId, "auction-id"),
        amount: validateAmount(amount),
        timestamp: timestamp(),
      })
    ).payloadWithSignature,
  );
  printResponse("bid", response);
  exitOnHttpError(response);
}

async function runCreateAuction(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      "base-url": { type: "string" },
      duration: { type: "string" },
      "env-key": { type: "string" },
      "event-id": { type: "string" },
      help: { type: "boolean", short: "h" },
      "private-leg": { type: "string" },
      pk: { type: "string" },
      "secret-payload": { type: "string" },
    },
  });

  if (parsed.values.help) {
    console.log(
      "Usage: pnpm frontend-api create-auction --event-id <id> --private-leg <yes|no> --secret-payload <text> --duration <6h|12h|24h|48h> [--pk <hex>] [--env-key <name>] [--base-url <url>]",
    );
    return;
  }

  const eventId = parsed.values["event-id"];
  const privateLeg = parsed.values["private-leg"];
  const secretPayload = parsed.values["secret-payload"];
  const duration = parsed.values.duration;

  if (!eventId) {
    fail("missing required argument: --event-id");
  }
  if (!privateLeg) {
    fail("missing required argument: --private-leg");
  }
  if (!secretPayload) {
    fail("missing required argument: --secret-payload");
  }
  if (!duration) {
    fail("missing required argument: --duration");
  }
  if (privateLeg !== "yes" && privateLeg !== "no") {
    fail("private-leg must be yes or no");
  }
  if (!CREATE_AUCTION_DURATIONS.includes(duration as (typeof CREATE_AUCTION_DURATIONS)[number])) {
    fail(`duration must be one of: ${CREATE_AUCTION_DURATIONS.join(", ")}`);
  }

  const common = toCommonOptions(parsed.values);
  const response = await requestJson(
    common,
    "POST",
    "/api/create-auction",
    await signCreateAuctionPayload(common, {
      eventId: validateNonNegativeIntegerString(eventId, "event-id"),
      privateLeg,
      secretPayload,
      duration,
    }),
  );
  printResponse("create-auction", response);
  exitOnHttpError(response);
}

function printError(error: unknown): never {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

const commands: Record<Command, (commandArgs: string[]) => Promise<void>> = {
  events: runEvents,
  secrets: runSecrets,
  snapshot: runSnapshot,
  reconcile: runReconcile,
  "private-balances": runPrivateBalances,
  "private-transfer": runPrivateTransfer,
  faucet: runFaucet,
  bid: runBid,
  "create-auction": runCreateAuction,
};

if (!command || command === "--help" || command === "-h") {
  console.log(usage());
  process.exit(0);
}

if (!(command in commands)) {
  fail(`unknown command "${command}"\n\n${usage()}`);
}

commands[command as Command](args).catch(printError);
