/*
NOTE TO CLAUDE: This code relates to the old CRE based system. It's being kept in until you've confirmed the Zama port works end to end. You can use it as reference for how the old system used to work, but you should not update or maintain these files.
*/
// monitor.ts
// Finds expired auctions via The Graph subgraph (1 HTTP call, 0 chain reads).
//
// Why subgraph instead of on-chain reads:
// - getOpenAuctions() returns only open (unclosed) auction IDs, but not endTime.
// - We need endTime to filter expired auctions client-side (to avoid wasting
//   CRE chain writes on auctions the contract will revert).
// - Reading endTime requires getAuction(id) per auction = N extra chain reads.
// - CRE caps chain reads at 15 per execution, so N+1 reads fails when N > 14.
// - The subgraph returns pre-filtered expired auctions in 1 HTTP call.

import {
  cre,
  ok,
  type Runtime,
  type HTTPSendRequester,
  consensusIdenticalAggregation,
} from "@chainlink/cre-sdk";
import type { Config } from "./types";

export interface ExpiredAuction {
  auctionId: bigint;
  sellerId: string;
  currentBid: bigint;
  eventId: bigint;
}

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
 * Queries the subgraph for open auctions whose endTime has passed.
 * Uses 1 HTTP call and 0 chain reads.
 */
export function findExpiredAuctions(
  runtime: Runtime<Config>,
  nowSeconds: number
): ExpiredAuction[] {
  const httpClient = new cre.capabilities.HTTPClient();

  const auctions: ExpiredAuction[] = httpClient
    .sendRequest(
      runtime,
      queryExpiredAuctions(runtime.config.subgraphUrl, nowSeconds),
      consensusIdenticalAggregation<ExpiredAuction[]>(),
    )(runtime.config)
    .result();

  runtime.log(`Subgraph returned ${auctions.length} expired auction(s)`);
  return auctions;
}

interface SubgraphAuction {
  auctionId: string;
  sellerId: string;
  currentBid: string;
  eventId: string;
  endTime: string;
}

const queryExpiredAuctions =
  (subgraphUrl: string, nowSeconds: number) =>
  (sendRequester: HTTPSendRequester, config: Config): ExpiredAuction[] => {
    const query = JSON.stringify({
      query: `{
        auctions(
          where: { status: "Open", endTime_lt: "${nowSeconds}" }
          first: 100
          orderBy: endTime
          orderDirection: asc
        ) {
          auctionId
          sellerId
          currentBid
          eventId
          endTime
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

    return parsed.data.auctions.map((a) => ({
      auctionId: BigInt(a.auctionId),
      sellerId: a.sellerId,
      currentBid: BigInt(a.currentBid),
      eventId: BigInt(a.eventId),
    }));
  };
