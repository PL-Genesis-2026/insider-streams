"use client";

import { useCallback, useMemo } from "react";
import { getFundingSnapshot } from "./get-funding-snapshot";
import {
  useFundingSnapshotQuery,
  useReconcileFundingMutation,
} from "./queries";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";
import { useSignedWalletSession } from "@/lib/wallet/use-signed-wallet-session";

type UseFundingSnapshotOptions = {
  enabled?: boolean;
};

export function useFundingSnapshot(options?: UseFundingSnapshotOptions) {
  const walletSession = useWalletSession();
  const { canSign, getSignedSession } = useSignedWalletSession();
  const canQueryFunding =
    (options?.enabled ?? true) &&
    walletSession.isConnected &&
    walletSession.isSupportedChain &&
    Boolean(walletSession.address) &&
    canSign;
  const fundingSnapshotQuery = useFundingSnapshotQuery(
    walletSession.address,
    getSignedSession,
    canQueryFunding,
  );
  const reconcileFundingMutation = useReconcileFundingMutation(
    walletSession.address,
    getSignedSession,
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
