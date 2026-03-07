"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Address } from "viem";
import { fetchFundingSnapshot, reconcileFunding } from "./api";

export function getFundingSnapshotQueryKey(address?: Address) {
  return ["funding-snapshot", address ?? "unknown"] as const;
}

export function useFundingSnapshotQuery(address?: Address, enabled = true) {
  return useQuery({
    queryKey: getFundingSnapshotQueryKey(address),
    queryFn: async () => {
      if (!address) {
        throw new Error("Funding snapshot requires a connected wallet address.");
      }

      return fetchFundingSnapshot(address);
    },
    enabled: enabled && Boolean(address),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}

export function useReconcileFundingMutation(address?: Address) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!address) {
        throw new Error("Funding reconciliation requires a connected wallet address.");
      }

      return reconcileFunding(address);
    },
    onSuccess: async ({ data }) => {
      await queryClient.invalidateQueries({
        queryKey: getFundingSnapshotQueryKey(address),
      });

      queryClient.setQueryData(getFundingSnapshotQueryKey(address), data);
    },
  });
}
