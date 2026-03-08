import type { PredictionEventsQuery } from "@/__generated__/graphql";
import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";

type EventCreatedItem = PredictionEventsQuery["eventCreateds"][number];
type SettlementResponseItem = PredictionEventsQuery["settlementResponses"][number];
type SharesPurchasedItem = PredictionEventsQuery["sharesPurchaseds"][number];

export type EventStatus = "open" | "closed" | "settling" | "settled";

export function getEventStatus(
  event: EventCreatedItem,
  settlement?: SettlementResponseItem,
): EventStatus {
  if (settlement) return "settled";
  const closeTime = Number(event.eventClose) * 1000;
  if (Date.now() > closeTime) return "closed";
  return "open";
}

export type EventVolume = {
  totalUsdc: bigint;
  yesUsdc: bigint;
  noUsdc: bigint;
  yesPercent: number;
  noPercent: number;
  traderCount: number;
  tradeCount: number;
};

export function computeEventVolume(
  eventId: string,
  purchases: readonly SharesPurchasedItem[],
): EventVolume {
  let yesUsdc = BigInt(0);
  let noUsdc = BigInt(0);
  const traders = new Set<string>();

  for (const p of purchases) {
    if (String(p.eventId) !== String(eventId)) continue;
    const amount = BigInt(p.usdcIn);
    if (p.outcome === 2) yesUsdc += amount;
    else if (p.outcome === 1) noUsdc += amount;
    traders.add(p.buyer.toLowerCase());
  }

  const totalUsdc = yesUsdc + noUsdc;
  const PRECISION = BigInt(10000);
  const yesPercent = totalUsdc > BigInt(0) ? Number((yesUsdc * PRECISION) / totalUsdc) / 100 : 50;
  const noPercent = totalUsdc > BigInt(0) ? Number((noUsdc * PRECISION) / totalUsdc) / 100 : 50;

  const tradeCount = purchases.filter(
    (p) => String(p.eventId) === String(eventId),
  ).length;

  return {
    totalUsdc,
    yesUsdc,
    noUsdc,
    yesPercent,
    noPercent,
    traderCount: traders.size,
    tradeCount,
  };
}

export function formatUsdc(amountRaw: bigint): string {
  const divisor = 10 ** CONFIDENTIAL_USDC_DECIMALS;
  const whole = Number(amountRaw) / divisor;
  if (whole >= 1_000_000) return `${(whole / 1_000_000).toFixed(1)}M`;
  if (whole >= 1_000) return `${(whole / 1_000).toFixed(1)}K`;
  if (whole >= 1) return whole.toFixed(2);
  if (whole > 0) return whole.toFixed(4);
  return "0";
}

export function formatTimeRemaining(unixSeconds: number): string {
  const diff = unixSeconds * 1000 - Date.now();
  if (diff <= 0) return "Ended";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatDate(unixSeconds: string | number): string {
  const ts = typeof unixSeconds === "string" ? Number(unixSeconds) : unixSeconds;
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(unixSeconds: string | number): string {
  const ts = typeof unixSeconds === "string" ? Number(unixSeconds) : unixSeconds;
  return new Date(ts * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shortenAddress(addr: string, start = 6, end = 4): string {
  if (addr.length <= start + end + 3) return addr;
  return `${addr.slice(0, start)}...${addr.slice(-end)}`;
}

export function outcomeLabel(outcome: number): string {
  switch (outcome) {
    case 1:
      return "No";
    case 2:
      return "Yes";
    case 3:
      return "Inconclusive";
    default:
      return "Unknown";
  }
}
