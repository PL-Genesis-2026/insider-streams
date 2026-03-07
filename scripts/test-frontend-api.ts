#!/usr/bin/env tsx
/**
 * Quick CLI to test the insider-streams-frontend REST API endpoints.
 *
 * Usage:
 *   tsx scripts/test-frontend-api.ts <command> [options]
 *
 * Commands:
 *   snapshot   --address <addr>
 *   reconcile  --address <addr>
 *   balances   [--pk <hex>]
 *   transfer   --recipient <addr> --token <addr> --amount <units> [--pk <hex>]
 *
 * Environment:
 *   BASE_URL   Frontend origin (default: http://localhost:3000)
 *   OWNER_PK   Fallback private key for signing (if --pk not provided)
 *
 * Examples:
 *   tsx scripts/test-frontend-api.ts snapshot --address 0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5
 *   tsx scripts/test-frontend-api.ts reconcile --address 0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5
 *   tsx scripts/test-frontend-api.ts balances
 *   tsx scripts/test-frontend-api.ts transfer --recipient 0x55D2... --token 0xee3A... --amount 1000000
 */

import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { VAULT_ADDRESS, PRIVATE_CONFIDENTIAL_USDC_ADDRESS } from "@private-streams/common";

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const EIP712_DOMAIN = {
  name: "CompliantPrivateTokenDemo" as const,
  version: "0.0.1" as const,
  chainId: 11155111,
  verifyingContract: VAULT_ADDRESS as Hex,
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function requireArg(name: string): string {
  const val = arg(name);
  if (!val) {
    console.error(`Missing required argument: --${name}`);
    process.exit(1);
  }
  return val;
}

function getPrivateKey(): Hex {
  const pk = arg("pk") ?? process.env.OWNER_PK;
  if (!pk) {
    console.error("No private key. Pass --pk <hex> or set OWNER_PK in .env");
    process.exit(1);
  }
  return (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex;
}

function timestamp(): number {
  return Math.floor(Date.now() / 1000);
}

async function request(method: "GET" | "POST", path: string, body?: unknown) {
  const url = `${BASE_URL}${path}`;
  console.log(`\n${method} ${url}`);
  if (body) console.log("Body:", JSON.stringify(body, null, 2));

  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) init.body = JSON.stringify(body);

  const res = await fetch(url, init);
  const text = await res.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  console.log(`\nStatus: ${res.status}`);
  console.log("Response:", JSON.stringify(parsed, null, 2));
  return { status: res.status, data: parsed };
}

// ── Commands ────────────────────────────────────────────────────────────────

async function snapshot() {
  const address = requireArg("address");
  await request("GET", `/api/funding/snapshot?address=${address}`);
}

async function reconcile() {
  const address = requireArg("address");
  await request("POST", "/api/funding/reconcile", { address });
}

async function balances() {
  const pk = getPrivateKey();
  const account = privateKeyToAccount(pk);
  const client = createWalletClient({
    account,
    chain: sepolia,
    transport: http(),
  });

  const ts = timestamp();
  const auth = await client.signTypedData({
    domain: EIP712_DOMAIN,
    types: {
      "Retrieve Balances": [
        { name: "account", type: "address" },
        { name: "timestamp", type: "uint256" },
      ],
    },
    primaryType: "Retrieve Balances",
    message: { account: account.address, timestamp: BigInt(ts) },
  });

  await request("POST", "/api/private-token/balances", {
    account: account.address,
    timestamp: ts,
    auth,
  });
}

async function transfer() {
  const pk = getPrivateKey();
  const recipient = requireArg("recipient") as Hex;
  const token = (arg("token") ?? PRIVATE_CONFIDENTIAL_USDC_ADDRESS) as Hex;
  const amount = requireArg("amount");

  const account = privateKeyToAccount(pk);
  const client = createWalletClient({
    account,
    chain: sepolia,
    transport: http(),
  });

  const ts = timestamp();
  const flags: string[] = [];

  const auth = await client.signTypedData({
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
      sender: account.address,
      recipient,
      token,
      amount: BigInt(amount),
      flags,
      timestamp: BigInt(ts),
    },
  });

  await request("POST", "/api/private-token/private-transfer", {
    account: account.address,
    recipient,
    token,
    amount,
    flags,
    timestamp: ts,
    auth,
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

const command = process.argv[2];

const commands: Record<string, () => Promise<void>> = {
  snapshot,
  reconcile,
  balances,
  transfer,
};

if (!command || !commands[command]) {
  console.log(`Usage: tsx scripts/test-frontend-api.ts <command> [options]

Commands:
  snapshot    GET  /api/funding/snapshot?address=<addr>
  reconcile   POST /api/funding/reconcile
  balances    POST /api/private-token/balances        (requires signing)
  transfer    POST /api/private-token/private-transfer (requires signing)

Options:
  --address <addr>     Wallet address (snapshot, reconcile)
  --recipient <addr>   Recipient address (transfer)
  --token <addr>       Token address (transfer, default: PRIVATE_CONFIDENTIAL_USDC)
  --amount <units>     Amount in smallest unit (transfer)
  --pk <hex>           Private key for signing (balances, transfer)

Environment:
  BASE_URL   Frontend origin (default: http://localhost:3000)
  OWNER_PK   Fallback private key if --pk not provided`);
  process.exit(command ? 1 : 0);
}

commands[command]().catch((err) => {
  console.error("\nError:", err.message ?? err);
  process.exit(1);
});
