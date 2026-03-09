import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { OUTCOME } from "@/lib/market-utils";

export function formatUsdc(amountRaw: bigint): string {
  const divisor = 10 ** CONFIDENTIAL_USDC_DECIMALS;
  const whole = Number(amountRaw) / divisor;
  if (whole >= 1_000_000) return `${(whole / 1_000_000).toFixed(1)}M`;
  if (whole >= 1_000) return `${(whole / 1_000).toFixed(1)}K`;
  if (whole >= 1) return whole.toFixed(2);
  if (whole > 0) return whole.toFixed(4);
  return "0";
}

export function formatShares(amountRaw: string): string {
  const divisor = 10 ** CONFIDENTIAL_USDC_DECIMALS;
  const shares = Number(amountRaw) / divisor;
  if (shares >= 1000) return `${(shares / 1000).toFixed(1)}K`;
  return shares.toFixed(2);
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

export function outcomeLabel(outcome: number): string {
  switch (outcome) {
    case OUTCOME.No:
      return "No";
    case OUTCOME.Yes:
      return "Yes";
    case OUTCOME.Inconclusive:
      return "Inconclusive";
    default:
      return "Unknown";
  }
}

/** Basis-points (0–10000) to display percentage string */
export function formatConfidenceBps(bps: number): string {
  return `${(bps / 100).toFixed(0)}%`;
}
