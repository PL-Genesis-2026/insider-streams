"use client";

import { useCallback, useMemo } from "react";
import { getFundingSnapshot } from "./get-funding-snapshot";
import {
  useFundingSnapshotQuery,
  useReconcileFundingMutation,
} from "./queries";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";

export function useFundingSnapshot() {
  const walletSession = useWalletSession();
  const canQueryFunding =
    walletSession.isConnected &&
    walletSession.isSupportedChain &&
    Boolean(walletSession.address);
  const fundingSnapshotQuery = useFundingSnapshotQuery(
    walletSession.address,
    canQueryFunding,
  );
  const reconcileFundingMutation = useReconcileFundingMutation(
    walletSession.address,
  );
  const errorMessage =
    fundingSnapshotQuery.error instanceof Error
      ? fundingSnapshotQuery.error.message
      : undefined;

  const fundingSnapshot = useMemo(
    () =>
      getFundingSnapshot(walletSession, fundingSnapshotQuery.data, {
        isReconcilePending: reconcileFundingMutation.isPending,
        errorMessage,
      }),
    [
      errorMessage,
      fundingSnapshotQuery.data,
      reconcileFundingMutation.isPending,
      walletSession,
    ],
  );

  const refresh = useCallback(async () => {
    await fundingSnapshotQuery.refetch();
  }, [fundingSnapshotQuery]);

  return {
    ...fundingSnapshot,
    isLoading: fundingSnapshotQuery.isLoading,
    isFetching: fundingSnapshotQuery.isFetching,
    error: fundingSnapshotQuery.error,
    reconcileError: reconcileFundingMutation.error,
    refresh,
    reconcile: reconcileFundingMutation.mutateAsync,
    reconcileResult: reconcileFundingMutation.data,
  };
}
