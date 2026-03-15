import type { Address } from "viem";

export type FundingStatus =
  | "wallet_required"
  | "wrong_network"
  | "funding_unavailable"
  | "private_data_hidden"
  | "not_funded_yet"
  | "reconciling_transfer"
  | "funded"
  | "withdrawal_available";

export type FundingServerSnapshot = {
  userId: string | null;
  balance: string;
  balanceUnavailable?: boolean;
  error?: string;
};

export type FundingSnapshotResponse = {
  userId: string | null;
  balance: string;
};

export type FundingWithdrawResponse = {
  withdrawalId: number;
  userId: string;
  amount: string;
  status: string;
};

export type FundingDepositResponse = {
  userId: string;
  amount: string;
  status: string;
};

export type FundingSnapshot = {
  status: FundingStatus;
  address?: Address;
  currentChainName?: string;
  requiredChainName: string;
  canPlaceBid: boolean;
  isReconciling: boolean;
  balance: string;
  balanceError?: string;
};
