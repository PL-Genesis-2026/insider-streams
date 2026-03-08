// monitor.ts
// Fetches auction IDs for a given eventId from the subgraph (1 HTTP call, 0 chain reads).
//
// Previously this module scanned getUnresolvedEvents() + getEvent() on-chain
// for each event, consuming N+1 chain reads and hitting CRE's 15-read limit.
// Now the workflow is log-triggered on SettlementResponse events, so it already
// knows which eventId was settled. We just need the auction IDs for that event,
// which the subgraph provides in a single HTTP call.

import {
  cre,
  ok,
  type Runtime,
  type HTTPSendRequester,
  consensusIdenticalAggregation,
} from "@chainlink/cre-sdk";
import type { Config } from "./types";

// Base64 encoding (QuickJS WASM-safe, no Buffer)
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(bytes: Uint8Array): string {
  let r = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    r += B64[(b0 >> 2) & 0x3f];
    r += B64[((b0 << 4) | (b1 >> 4)) & 0x3f];
    r += i + 1 < len ? B64[((b1 << 2) | (b2 >> 6)) & 0x3f] : "=";
    r += i + 2 < len ? B64[b2 & 0x3f] : "=";
  }
  return r;
}

/**
 * Queries the subgraph for all auction IDs belonging to a given eventId.
 * Returns auction IDs as bigints. Uses 1 HTTP call, 0 chain reads.
 */
export function fetchAuctionIdsForEvent(
  runtime: Runtime<Config>,
  eventId: bigint,
): bigint[] {
  const httpClient = new cre.capabilities.HTTPClient();

  const auctionIds: bigint[] = httpClient
    .sendRequest(
      runtime,
      queryAuctionsByEvent(runtime.config.subgraphUrl, eventId.toString()),
      consensusIdenticalAggregation<bigint[]>(),
    )(runtime.config)
    .result();

  runtime.log(`Subgraph returned ${auctionIds.length} auction(s) for event ${eventId}`);
  return auctionIds;
}

interface SubgraphAuction {
  auctionId: string;
}

const queryAuctionsByEvent =
  (subgraphUrl: string, eventId: string) =>
  (sendRequester: HTTPSendRequester, config: Config): bigint[] => {
    const query = JSON.stringify({
      query: `{
        auctions(
          where: { eventId: "${eventId}" }
          first: 100
          orderBy: auctionId
          orderDirection: asc
        ) {
          auctionId
        }
      }`,
    });

    const encodedBody = base64Encode(new TextEncoder().encode(query));

    const resp = sendRequester
      .sendRequest({
        url: subgraphUrl,
        method: "POST" as const,
        body: encodedBody,
        headers: { "Content-Type": "application/json" },
        cacheSettings: { readFromCache: false, maxAgeMs: 0 },
      })
      .result();

    if (!ok(resp)) {
      const bodyText = new TextDecoder().decode(resp.body);
      throw new Error(`Subgraph query failed (${resp.statusCode}): ${bodyText}`);
    }

    const bodyText = new TextDecoder().decode(resp.body);
    const parsed = JSON.parse(bodyText) as {
      data?: { auctions: SubgraphAuction[] };
      errors?: { message: string }[];
    };

    if (parsed.errors?.length) {
      throw new Error(`Subgraph error: ${parsed.errors[0].message}`);
    }

    if (!parsed.data?.auctions) {
      return [];
    }

    return parsed.data.auctions.map((a) => BigInt(a.auctionId));
  };
