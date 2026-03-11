"use client";

import {
  useQuery,
} from "@tanstack/react-query";
import type { Address } from "viem";
import { fetchFundingSnapshot } from "./api";
import type { SignedWalletSession } from "@/lib/wallet/use-signed-wallet-session";

export function getFundingSnapshotQueryKey(address?: Address) {
  return ["funding-snapshot", address ?? "unknown"] as const;
}

export function useFundingSnapshotQuery(
  address: Address | undefined,
  getSignedSession: () => Promise<SignedWalletSession>,
  enabled = true,
) {
  return useQuery({
    queryKey: getFundingSnapshotQueryKey(address),
    queryFn: async () => {
      if (!address) {
        throw new Error("Funding snapshot requires a connected wallet address.");
      }

      const session = await getSignedSession();
      return fetchFundingSnapshot(session);
    },
    enabled: enabled && Boolean(address),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
