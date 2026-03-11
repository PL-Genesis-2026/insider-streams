import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { formatUnits } from "viem";

export function formatFundingBalance(rawValue: string) {
  const formatted = Number(
    formatUnits(BigInt(rawValue), CONFIDENTIAL_USDC_DECIMALS),
  ).toLocaleString("en-US", { maximumFractionDigits: 4 });

  return `${formatted} USDC`;
}

export function getDisplayFundingBalance(balance?: string | null) {
  if (!balance || BigInt(balance) <= BigInt(0)) {
    return null;
  }
  return formatFundingBalance(balance);
}
