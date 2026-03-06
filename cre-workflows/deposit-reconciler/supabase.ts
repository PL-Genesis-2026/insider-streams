// supabase.ts
// Writes deposit and transfer records to Supabase via REST API using CRE HTTPClient.
// Uses batch inserts (POST array) with Prefer: resolution=ignore-duplicates
// so the entire batch is a single HTTP call and duplicates are silently skipped.
// This keeps total HTTP calls per workflow execution to 3 (fetch + deposits + transfers),
// well within CRE's per-workflow limit of 5.

import {
  cre,
  ok,
  type Runtime,
  type HTTPSendRequester,
  consensusIdenticalAggregation,
} from "@chainlink/cre-sdk";
import type { Config, PrivateTokenTransaction } from "./types";
import { base64Encode } from "./secp256k1";

// Response shape for batch upserts — just need to know counts.
interface BatchInsertResponse {
  inserted: number;
  total: number;
}

/**
 * Batch-inserts deposits into Supabase. Duplicates (by transaction_id UNIQUE
 * constraint) are silently ignored via `Prefer: resolution=ignore-duplicates`.
 * Returns the number of newly inserted rows.
 */
export function recordDeposits(
  runtime: Runtime<Config>,
  deposits: PrivateTokenTransaction[],
): number {
  if (deposits.length === 0) return 0;

  const serviceRoleKey = runtime.getSecret({ id: "SUPABASE_SERVICE_ROLE_KEY" }).result();
  const httpClient = new cre.capabilities.HTTPClient();

  const result: BatchInsertResponse = httpClient
    .sendRequest(
      runtime,
      postDeposits(runtime.config.supabaseUrl, serviceRoleKey.value, deposits),
      consensusIdenticalAggregation<BatchInsertResponse>(),
    )(runtime.config)
    .result();

  runtime.log(`Deposits: ${result.inserted} new out of ${result.total} total`);
  return result.inserted;
}

/**
 * Batch-inserts outgoing transfers into Supabase. Duplicates (by transaction_id)
 * are silently ignored via `Prefer: resolution=ignore-duplicates`.
 * Returns the number of newly inserted rows.
 */
export function recordTransfers(
  runtime: Runtime<Config>,
  transfers: PrivateTokenTransaction[],
): number {
  if (transfers.length === 0) return 0;

  const serviceRoleKey = runtime.getSecret({ id: "SUPABASE_SERVICE_ROLE_KEY" }).result();
  const httpClient = new cre.capabilities.HTTPClient();

  const result: BatchInsertResponse = httpClient
    .sendRequest(
      runtime,
      postTransfers(runtime.config.supabaseUrl, serviceRoleKey.value, transfers),
      consensusIdenticalAggregation<BatchInsertResponse>(),
    )(runtime.config)
    .result();

  runtime.log(`Transfers: ${result.inserted} new out of ${result.total} total`);
  return result.inserted;
}

/**
 * Builds the HTTP request for batch-inserting deposits via Supabase REST API.
 * Posts an array of deposit objects; duplicates are ignored by PostgREST.
 */
const postDeposits =
  (
    supabaseUrl: string,
    serviceRoleKey: string,
    txs: PrivateTokenTransaction[],
  ) =>
  (
    sendRequester: HTTPSendRequester,
    config: Config,
  ): BatchInsertResponse => {
    const rows = txs.map((tx) => ({
      transaction_id: tx.id,
      user_address: tx.account.toLowerCase(),
      sender_address: tx.account.toLowerCase(),
      token_address: tx.token.toLowerCase(),
      amount: tx.amount,
      status: "confirmed",
      raw_data: tx,
    }));

    const bodyBytes = new TextEncoder().encode(JSON.stringify(rows));
    const encodedBody = base64Encode(bodyBytes);

    const req = {
      url: `${supabaseUrl}/rest/v1/deposits?on_conflict=transaction_id`,
      method: "POST" as const,
      body: encodedBody,
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Prefer": "resolution=ignore-duplicates,return=representation",
      },
      cacheSettings: {
        readFromCache: false,
        maxAgeMs: 0,
      },
    };

    const resp = sendRequester.sendRequest(req).result();
    if (!ok(resp)) {
      const bodyText = new TextDecoder().decode(resp.body);
      throw new Error(`Supabase POST /deposits failed (${resp.statusCode}): ${bodyText}`);
    }

    // PostgREST returns only the newly inserted rows (duplicates are excluded)
    const bodyText = new TextDecoder().decode(resp.body);
    const inserted = JSON.parse(bodyText) as unknown[];

    return { inserted: inserted.length, total: txs.length };
  };

/**
 * Builds the HTTP request for batch-inserting transfer records via Supabase REST API.
 * Outgoing transfers from the platform EOA represent processed withdrawals.
 */
const postTransfers =
  (
    supabaseUrl: string,
    serviceRoleKey: string,
    txs: PrivateTokenTransaction[],
  ) =>
  (
    sendRequester: HTTPSendRequester,
    config: Config,
  ): BatchInsertResponse => {
    // user_address = sender (the depositor whose balance is debited)
    // recipient_address = who receives the tokens
    const rows = txs.map((tx) => ({
      user_address: tx.sender.toLowerCase(),
      token_address: tx.token.toLowerCase(),
      amount: tx.amount,
      recipient_address: tx.recipient.toLowerCase(),
      status: "completed",
      transaction_id: tx.id,
      type: "user_withdrawal",
    }));

    const bodyBytes = new TextEncoder().encode(JSON.stringify(rows));
    const encodedBody = base64Encode(bodyBytes);

    const req = {
      url: `${supabaseUrl}/rest/v1/transfers?on_conflict=transaction_id`,
      method: "POST" as const,
      body: encodedBody,
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Prefer": "resolution=ignore-duplicates,return=representation",
      },
      cacheSettings: {
        readFromCache: false,
        maxAgeMs: 0,
      },
    };

    const resp = sendRequester.sendRequest(req).result();
    if (!ok(resp)) {
      const bodyText = new TextDecoder().decode(resp.body);
      throw new Error(`Supabase POST /transfers failed (${resp.statusCode}): ${bodyText}`);
    }

    const bodyText = new TextDecoder().decode(resp.body);
    const inserted = JSON.parse(bodyText) as unknown[];

    return { inserted: inserted.length, total: txs.length };
  };
