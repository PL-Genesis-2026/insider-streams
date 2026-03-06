// supabase.ts
// Writes deposit and transfer records to Supabase via REST API using CRE HTTPClient.
// Uses a single batch insert (POST array) with Prefer: resolution=ignore-duplicates
// so the entire batch is a single HTTP call and duplicates are silently skipped.
// This keeps total HTTP calls per workflow execution to 2 (fetch + batch insert),
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
 * Batch-inserts both deposit and withdrawal rows into the unified `transfers`
 * table in Supabase. Duplicates (by transaction_id UNIQUE constraint) are
 * silently ignored via `Prefer: resolution=ignore-duplicates`.
 * Returns the number of newly inserted rows.
 *
 * Both directions come from API `type: "transfer"` transactions:
 * - incoming (is_incoming: true) → type: "deposit", user_address = sender (the depositor)
 * - outgoing (is_incoming: false) → type: "user_withdrawal", user_address = recipient (the user being debited)
 */
export function recordTransactions(
  runtime: Runtime<Config>,
  incoming: PrivateTokenTransaction[],
  outgoing: PrivateTokenTransaction[],
): number {
  const total = incoming.length + outgoing.length;
  if (total === 0) return 0;

  // Map incoming transfers (deposits) to transfer rows
  const depositRows = incoming.map((tx) => ({
    transaction_id: tx.id,
    type: "deposit",
    user_address: tx.sender.toLowerCase(),
    sender_address: tx.sender.toLowerCase(),
    recipient_address: tx.recipient.toLowerCase(),
    token_address: tx.token.toLowerCase(),
    amount: tx.amount,
    status: "confirmed",
    raw_data: tx,
  }));

  // Map outgoing transfers (withdrawals) to transfer rows
  // user_address = recipient (the user whose balance is being debited)
  const withdrawalRows = outgoing.map((tx) => ({
    transaction_id: tx.id,
    type: "user_withdrawal",
    user_address: tx.recipient.toLowerCase(),
    sender_address: tx.sender.toLowerCase(),
    recipient_address: tx.recipient.toLowerCase(),
    token_address: tx.token.toLowerCase(),
    amount: tx.amount,
    status: "completed",
    raw_data: tx,
  }));

  const rows = [...depositRows, ...withdrawalRows];

  const serviceRoleKey = runtime.getSecret({ id: "SUPABASE_SERVICE_ROLE_KEY" }).result();
  const httpClient = new cre.capabilities.HTTPClient();

  const result: BatchInsertResponse = httpClient
    .sendRequest(
      runtime,
      postTransactions(runtime.config.supabaseUrl, serviceRoleKey.value, rows),
      consensusIdenticalAggregation<BatchInsertResponse>(),
    )(runtime.config)
    .result();

  runtime.log(`Transactions: ${result.inserted} new out of ${result.total} total (${incoming.length} deposits, ${outgoing.length} withdrawals)`);
  return result.inserted;
}

/**
 * Builds the HTTP request for batch-inserting transaction records via Supabase REST API.
 * Posts an array of transfer objects; duplicates are ignored by PostgREST.
 */
const postTransactions =
  (
    supabaseUrl: string,
    serviceRoleKey: string,
    rows: Record<string, unknown>[],
  ) =>
  (
    sendRequester: HTTPSendRequester,
    config: Config,
  ): BatchInsertResponse => {
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

    // PostgREST returns only the newly inserted rows (duplicates are excluded)
    const bodyText = new TextDecoder().decode(resp.body);
    const inserted = JSON.parse(bodyText) as unknown[];

    return { inserted: inserted.length, total: rows.length };
  };
