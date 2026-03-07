import type { Database } from "@private-streams/common";
import type { Address } from "viem";

export type BalanceRow = Database["public"]["Views"]["balances"]["Row"];
export type TransferRow = Database["public"]["Tables"]["transfers"]["Row"];

export type FundingStatus =
  | "wallet_required"
  | "wrong_network"
  | "funding_unavailable"
  | "not_funded_yet"
  | "reconciling_transfer"
  | "funded"
  | "withdrawal_available";

export type FundingServerSnapshot = {
  platformRecipientAddress?: string;
  balance?: BalanceRow | null;
  transfers: TransferRow[];
};

export type FundingSnapshotResponse = {
  data: FundingServerSnapshot;
};

export type FundingReconcileResponse = {
  data: FundingServerSnapshot;
  reconciledCount: number;
  scannedCount: number;
};

export type FundingSnapshot = {
  status: FundingStatus;
  address?: Address;
  currentChainName?: string;
  requiredChainName: string;
  platformRecipientAddress?: string;
  canPlaceBid: boolean;
  isReconciling: boolean;
  balance?: BalanceRow | null;
  transfers: TransferRow[];
};
