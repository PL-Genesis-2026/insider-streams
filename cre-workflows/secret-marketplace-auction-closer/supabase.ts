/*
NOTE TO CLAUDE: This code relates to the old CRE based system. It's being kept in until you've confirmed the Zama port works end to end. You can use it as reference for how the old system used to work, but you should not update or maintain these files.
*/
// supabase.ts
// Settles winning bids in Supabase after auctions are closed on-chain.
// Uses batched HTTP calls to stay within CRE's 5-call-per-execution limit:
//   1. GET all active bids for the closed auction IDs (1 HTTP call)
//   2. PATCH all matched bids to status=won (1 HTTP call)
// Total: 2 HTTP calls regardless of how many auctions close.

import {
  cre,
  ok,
  type Runtime,
  type HTTPSendRequester,
  consensusIdenticalAggregation,
} from "@chainlink/cre-sdk";
import type { Config } from "./types";

// ── Base64 encoding (QuickJS WASM-safe, no Buffer) ──────────────────────────

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += B64_CHARS[(b0 >> 2) & 0x3f];
    result += B64_CHARS[((b0 << 4) | (b1 >> 4)) & 0x3f];
    result += i + 1 < len ? B64_CHARS[((b1 << 2) | (b2 >> 6)) & 0x3f] : "=";
    result += i + 2 < len ? B64_CHARS[b2 & 0x3f] : "=";
  }
  return result;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ActiveBid {
  id: string;
  auction_id: string;
  bidder_address: string;
  amount: string;
}

// ── Batched settlement ──────────────────────────────────────────────────────

/**
 * Settles all winning bids for the given closed auction IDs in 2 HTTP calls:
 *   1. GET active bids for all auction IDs (batch query)
 *   2. PATCH all matched bids to status=won (batch update)
 *
 * Returns the number of bids settled.
 */
export function settleWinningBids(
  runtime: Runtime<Config>,
  closedAuctionIds: string[],
): number {
  if (closedAuctionIds.length === 0) return 0;

  const serviceRoleKey = runtime.getSecret({ id: "SUPABASE_SERVICE_ROLE_KEY" }).result();
  const httpClient = new cre.capabilities.HTTPClient();

  // Step 1: GET all active bids for the closed auctions (1 HTTP call)
  const auctionIdList = closedAuctionIds.map((id) => `"${id}"`).join(",");
  const activeBids: ActiveBid[] = httpClient
    .sendRequest(
      runtime,
      getActiveBids(runtime.config.supabaseUrl, serviceRoleKey.value, auctionIdList),
      consensusIdenticalAggregation<ActiveBid[]>(),
    )(runtime.config)
    .result();

  if (activeBids.length === 0) {
    runtime.log("No active bids found for closed auctions");
    return 0;
  }

  runtime.log(`Found ${activeBids.length} active bid(s) to settle`);

  // Step 2: PATCH all matched bids to won (1 HTTP call)
  const bidIds = activeBids.map((b) => `"${b.id}"`).join(",");
  const nowIso = new Date().toISOString();

  const updatedCount: number = httpClient
    .sendRequest(
      runtime,
      patchBidsWon(runtime.config.supabaseUrl, serviceRoleKey.value, bidIds, nowIso),
      consensusIdenticalAggregation<number>(),
    )(runtime.config)
    .result();

  runtime.log(`Settled ${updatedCount} bid(s) to won`);
  return updatedCount;
}

// ── HTTP request builders ───────────────────────────────────────────────────

/**
 * GET /rest/v1/private_bids?auction_id=in.(id1,id2)&status=eq.active
 * Returns all active bids for the given auction IDs.
 */
const getActiveBids =
  (supabaseUrl: string, serviceRoleKey: string, auctionIdList: string) =>
  (sendRequester: HTTPSendRequester, config: Config): ActiveBid[] => {
    const url = `${supabaseUrl}/rest/v1/private_bids?auction_id=in.(${auctionIdList})&status=eq.active&select=id,auction_id,bidder_address,amount`;

    const resp = sendRequester
      .sendRequest({
        url,
        method: "GET" as const,
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Accept": "application/json",
        },
        cacheSettings: {
          readFromCache: false,
          maxAgeMs: 0,
        },
      })
      .result();

    if (!ok(resp)) {
      const bodyText = new TextDecoder().decode(resp.body);
      throw new Error(`Supabase GET /private_bids failed (${resp.statusCode}): ${bodyText}`);
    }

    const bodyText = new TextDecoder().decode(resp.body);
    return JSON.parse(bodyText) as ActiveBid[];
  };

/**
 * PATCH /rest/v1/private_bids?id=in.(bid1,bid2)
 * Updates all matching bids to status=won with won_at timestamp.
 * Returns the count of updated rows.
 */
const patchBidsWon =
  (supabaseUrl: string, serviceRoleKey: string, bidIdList: string, wonAt: string) =>
  (sendRequester: HTTPSendRequester, config: Config): number => {
    const url = `${supabaseUrl}/rest/v1/private_bids?id=in.(${bidIdList})`;
    const body = JSON.stringify({ status: "won", won_at: wonAt });
    const bodyBytes = new TextEncoder().encode(body);
    const encodedBody = base64Encode(bodyBytes);

    const resp = sendRequester
      .sendRequest({
        url,
        method: "PATCH" as const,
        body: encodedBody,
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Prefer": "return=representation",
        },
        cacheSettings: {
          readFromCache: false,
          maxAgeMs: 0,
        },
      })
      .result();

    if (!ok(resp)) {
      const bodyText = new TextDecoder().decode(resp.body);
      throw new Error(`Supabase PATCH /private_bids failed (${resp.statusCode}): ${bodyText}`);
    }

    const bodyText = new TextDecoder().decode(resp.body);
    const updated = JSON.parse(bodyText) as unknown[];
    return updated.length;
  };
