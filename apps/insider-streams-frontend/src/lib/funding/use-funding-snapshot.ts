"use client";

import { useCallback, useMemo } from "react";
import { getFundingSnapshot } from "./get-funding-snapshot";
import { useFundingSnapshotQuery } from "./queries";
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
  const errorMessage =
    fundingSnapshotQuery.error instanceof Error
      ? fundingSnapshotQuery.error.message
      : undefined;

  const fundingNotYetChecked =
    fundingSnapshotQuery.data === undefined && !fundingSnapshotQuery.isError;

  const fundingSnapshot = useMemo(
    () =>
      getFundingSnapshot(walletSession, fundingSnapshotQuery.data, {
        errorMessage,
        fundingNotYetChecked,
      }),
    [
      errorMessage,
      fundingNotYetChecked,
      fundingSnapshotQuery.data,
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
    reconcileError: null as Error | null,
    refresh,
    reconcile: null as unknown,
    reconcileResult: null as unknown,
  };
}
