import {
  CONFIDENTIAL_USDC_DECIMALS,
  CONFIDENTIAL_USDC_FAUCET_ACTION,
} from "@private-streams/common";
import { parseUnits } from "viem";

export { CONFIDENTIAL_USDC_FAUCET_ACTION };
export const CONFIDENTIAL_USDC_FAUCET_AMOUNT_DISPLAY = "1000" as const;

export const CONFIDENTIAL_USDC_FAUCET_AMOUNT_BASE_UNITS = parseUnits(
  CONFIDENTIAL_USDC_FAUCET_AMOUNT_DISPLAY,
  CONFIDENTIAL_USDC_DECIMALS,
);

export type ConfidentialUsdcFaucetSuccessResponse = {
  success: true;
  address: string;
  amountBaseUnits: string;
  amountDisplay: string;
  balanceAfter: string;
  txHash: `0x${string}`;
};

export type ConfidentialUsdcFaucetErrorResponse = {
  success: false;
  code: string;
  error: string;
};

export type ConfidentialUsdcFaucetResponse =
  | ConfidentialUsdcFaucetSuccessResponse
  | ConfidentialUsdcFaucetErrorResponse;
