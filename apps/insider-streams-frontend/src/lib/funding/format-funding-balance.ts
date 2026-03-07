import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { formatUnits } from "viem";
import type { BalanceRow } from "./types";

function hasPositiveValue(value?: string | null): value is string {
  return value !== undefined && value !== null && BigInt(value) > BigInt(0);
}

export function formatFundingBalance(rawValue: string) {
  const formatted = Number(
    formatUnits(BigInt(rawValue), CONFIDENTIAL_USDC_DECIMALS),
  ).toLocaleString("en-US", { maximumFractionDigits: 4 });

  return `${formatted} USDC`;
}

export function getDisplayFundingBalance(balance?: BalanceRow | null) {
  if (!balance) {
    return null;
  }

  if (hasPositiveValue(balance.available_balance)) {
    return formatFundingBalance(balance.available_balance);
  }

  if (hasPositiveValue(balance.locked_balance)) {
    return formatFundingBalance(balance.locked_balance);
  }

  if (hasPositiveValue(balance.pending_withdrawal)) {
    return formatFundingBalance(balance.pending_withdrawal);
  }

  return null;
}
