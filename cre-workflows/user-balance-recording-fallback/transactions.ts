/*
NOTE TO CLAUDE: This code relates to the old CRE based system. It's being kept in until you've confirmed the Zama port works end to end. You can use it as reference for how the old system used to work, but you should not update or maintain these files.
*/
// transactions.ts
// EIP-712 signed POST /transactions to the Private Token API.
// Uses CRE HTTPClient to poll for incoming transfers to the platform EOA.
//
// WASM COMPATIBILITY:
// CRE compiles workflows to WASM (Bun → Javy/QuickJS). The QuickJS engine
// does NOT provide `node:crypto`, so libraries like @noble/curves and
// viem/accounts crash at module load time. We use:
//   - viem core's hashTypedData() for EIP-712 hashing (pure keccak256, works)
//   - A minimal pure-JS secp256k1 ECDSA signer (./secp256k1.ts)
//   - Manual base64 encoding (no Buffer global in QuickJS)

import {
  cre,
  ok,
  getNetwork,
  type Runtime,
  type HTTPSendRequester,
  consensusIdenticalAggregation,
} from "@chainlink/cre-sdk";
import { hashTypedData } from "viem";
import type { Config, TransactionsResponse, PrivateTokenTransaction } from "./types";
import { getEip712Domain, EIP712_TYPES } from "./types";
import { signDigest, base64Encode } from "./secp256k1";

/**
 * Normalize a raw API transaction into our flat interface where all fields
 * are required. Missing fields get "" or false defaults so CRE consensus
 * aggregation can serialize them without undefined values.
 */
function normalizeTransaction(raw: Record<string, unknown>): PrivateTokenTransaction {
  return {
    id: (raw.id as string) ?? "",
    type: (raw.type as string) ?? "",
    account: (raw.account as string) ?? "",
    token: (raw.token as string) ?? "",
    amount: (raw.amount as string) ?? "",
    tx_hash: (raw.tx_hash as string) ?? "",
    sender: (raw.sender as string) ?? "",
    recipient: (raw.recipient as string) ?? "",
    is_incoming: (raw.is_incoming as boolean) ?? false,
    is_sender_hidden: (raw.is_sender_hidden as boolean) ?? false,
    withdraw_status: (raw.withdraw_status as string) ?? "",
  };
}

/**
 * Polls the Private Token API for recent transactions to the platform EOA.
 * Signs the request with EIP-712 using the platform EOA's private key.
 */
export function fetchTransactions(
  runtime: Runtime<Config>,
): TransactionsResponse {
  const platformPk = runtime.getSecret({ id: "PLATFORM_EOA_PK" }).result();
  // Address is in config — no need to derive from private key
  const address = runtime.config.platformEoaAddress;
  const timestamp = Math.floor(Date.now() / 1000);
  const limit = parseInt(runtime.config.transactionLimit, 10);

  // Derive chainId from CRE network registry
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Unknown chain selector: ${runtime.config.chainSelectorName}`);
  const chainId = parseInt(network.chainId, 10);
  const domain = getEip712Domain(chainId);

  runtime.log(`Fetching transactions for ${address} (limit=${limit})`);

  const message = {
    account: address as `0x${string}`,
    timestamp: BigInt(timestamp),
    cursor: "",
    limit: BigInt(limit),
  };

  // Compute EIP-712 hash synchronously (viem core — works in WASM)
  const digest = hashTypedData({
    domain,
    types: EIP712_TYPES,
    primaryType: "List Transactions",
    message,
  });

  // Sign synchronously using pure-JS secp256k1 (no node:crypto dependency)
  const signature = signDigest(digest, platformPk.value as `0x${string}`);

  runtime.log(`Signed EIP-712 digest, requesting transactions...`);

  const httpClient = new cre.capabilities.HTTPClient();

  const result: TransactionsResponse = httpClient
    .sendRequest(
      runtime,
      postTransactions(
        runtime.config.privateTokenApiUrl,
        address,
        timestamp,
        limit,
        signature,
      ),
      consensusIdenticalAggregation<TransactionsResponse>(),
    )(runtime.config)
    .result();

  return result;
}

/**
 * Builds the HTTP request for POST /transactions.
 * Normalizes the raw API response so all PrivateTokenTransaction fields
 * are populated (no undefined values — required for CRE consensus).
 */
const postTransactions =
  (
    apiUrl: string,
    account: string,
    timestamp: number,
    limit: number,
    auth: string,
  ) =>
  (
    sendRequester: HTTPSendRequester,
    config: Config,
  ): TransactionsResponse => {
    const body = {
      account,
      timestamp,
      auth,
      limit,
    };

    const bodyBytes = new TextEncoder().encode(JSON.stringify(body));
    const encodedBody = base64Encode(bodyBytes);

    const req = {
      url: `${apiUrl}/transactions`,
      method: "POST" as const,
      body: encodedBody,
      headers: {
        "Content-Type": "application/json",
      },
      cacheSettings: {
        readFromCache: false,
        maxAgeMs: 0,
      },
    };

    const resp = sendRequester.sendRequest(req).result();
    if (!ok(resp))
      throw new Error(`POST /transactions failed with status: ${resp.statusCode}`);

    const bodyText = new TextDecoder().decode(resp.body);
    const raw = JSON.parse(bodyText) as {
      transactions?: Record<string, unknown>[];
      has_more?: boolean;
      next_cursor?: string | null;
    };

    // Normalize each transaction so all fields are defined (no undefined)
    const transactions = (raw.transactions ?? []).map(normalizeTransaction);

    return {
      transactions,
      has_more: raw.has_more ?? false,
      next_cursor: raw.next_cursor ?? "",
    };
  };
