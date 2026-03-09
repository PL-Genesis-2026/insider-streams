import type { PredictionEventsQuery } from "@/__generated__/graphql";

type EventCreatedItem = PredictionEventsQuery["eventCreateds"][number];
type SettlementResponseItem = PredictionEventsQuery["settlementResponses"][number];
type SharesPurchasedItem = PredictionEventsQuery["sharesPurchaseds"][number];
type SettlementRequestLike = { eventId: string };

export const SEPOLIA_EXPLORER_URL = "https://sepolia.etherscan.io" as const;

export const ZERO_TX_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * Contract `Outcome` enum values from ExamplePredictionMarket.sol.
 * `None = 0, No = 1, Yes = 2, Inconclusive = 3`
 */
export const OUTCOME = {
  None: 0,
  No: 1,
  Yes: 2,
  Inconclusive: 3,
} as const;

export const MARKET_STATUS = {
  Open: 0,
  SettlementRequested: 1,
  Settled: 2,
  NeedsManual: 3,
} as const;

export type EventStatus =
  | "open"
  | "closed"
  | "settling"
  | "manual"
  | "settled";

export function getEventStatus(
  event: EventCreatedItem,
  settlement?: SettlementResponseItem,
  settlementRequest?: SettlementRequestLike,
): EventStatus {
  if (settlement?.status === MARKET_STATUS.Settled) return "settled";
  if (settlement?.status === MARKET_STATUS.NeedsManual) return "manual";
  if (settlementRequest) return "settling";
  const closeTime = Number(event.eventClose) * 1000;
  if (Date.now() > closeTime) return "closed";
  return "open";
}

export type EventVolume = {
  totalUsdc: bigint;
  yesUsdc: bigint;
  noUsdc: bigint;
  /** null when totalUsdc is 0 (no trades) */
  yesPercent: number | null;
  /** null when totalUsdc is 0 (no trades) */
  noPercent: number | null;
  traderCount: number;
  tradeCount: number;
};

/**
 * Single-pass grouping: builds a Map<eventId, EventVolume> for all events
 * in one scan over the purchases array.
 */
export function computeAllEventVolumes(
  purchases: readonly SharesPurchasedItem[],
): Map<string, EventVolume> {
  const accum = new Map<
    string,
    { yesUsdc: bigint; noUsdc: bigint; traders: Set<string>; tradeCount: number }
  >();

  for (const p of purchases) {
    const eid = String(p.eventId);
    let entry = accum.get(eid);
    if (!entry) {
      entry = { yesUsdc: BigInt(0), noUsdc: BigInt(0), traders: new Set(), tradeCount: 0 };
      accum.set(eid, entry);
    }
    const amount = BigInt(p.usdcIn);
    if (p.outcome === OUTCOME.Yes) entry.yesUsdc += amount;
    else if (p.outcome === OUTCOME.No) entry.noUsdc += amount;
    entry.traders.add(p.buyer.toLowerCase());
    entry.tradeCount++;
  }

  const result = new Map<string, EventVolume>();
  const PRECISION = BigInt(10000);

  for (const [eid, entry] of accum) {
    const totalUsdc = entry.yesUsdc + entry.noUsdc;
    const hasVolume = totalUsdc > BigInt(0);
    result.set(eid, {
      totalUsdc,
      yesUsdc: entry.yesUsdc,
      noUsdc: entry.noUsdc,
      yesPercent: hasVolume ? Number((entry.yesUsdc * PRECISION) / totalUsdc) / 100 : null,
      noPercent: hasVolume ? Number((entry.noUsdc * PRECISION) / totalUsdc) / 100 : null,
      traderCount: entry.traders.size,
      tradeCount: entry.tradeCount,
    });
  }

  return result;
}

/**
 * Compute volume for a single event. Used by the detail page where only
 * one event's purchases are fetched.
 */
export function computeEventVolume(
  eventId: string,
  purchases: readonly SharesPurchasedItem[],
): EventVolume {
  const map = computeAllEventVolumes(purchases);
  return (
    map.get(String(eventId)) ?? {
      totalUsdc: BigInt(0),
      yesUsdc: BigInt(0),
      noUsdc: BigInt(0),
      yesPercent: null,
      noPercent: null,
      traderCount: 0,
      tradeCount: 0,
    }
  );
}
