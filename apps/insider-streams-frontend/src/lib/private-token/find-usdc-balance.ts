import { PRIVATE_CONFIDENTIAL_USDC_ADDRESS } from "@private-streams/common";
import { getAddress, isAddressEqual } from "viem";

export function findUsdcBalance(
  balances?: { token: string; amount: string }[],
): { token: string; amount: string } | undefined {
  return balances?.find((balance) => {
    try {
      return isAddressEqual(
        getAddress(balance.token),
        PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
      );
    } catch {
      return false;
    }
  });
}
