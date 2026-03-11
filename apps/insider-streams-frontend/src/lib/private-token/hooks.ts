"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { parseUnits } from "viem";
import { useSignMessage } from "wagmi";
import stringify from "fast-json-stable-stringify";
import { requestFundingDeposit } from "@/lib/funding/api";
import { requestFundingWithdrawal } from "@/lib/funding/api";
import { getFundingSnapshotQueryKey } from "@/lib/funding/queries";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";

export function useDeposit() {
  const queryClient = useQueryClient();
  const walletSession = useWalletSession();
  const { signMessageAsync } = useSignMessage();

  return useMutation({
    mutationFn: async (amountHuman: string) => {
      if (!walletSession.address) {
        throw new Error("Connect your wallet to deposit.");
      }

      const parsed = parseUnits(amountHuman, CONFIDENTIAL_USDC_DECIMALS);
      if (parsed <= BigInt(0)) {
        throw new Error("Enter an amount greater than zero.");
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const payload = { amount: parsed.toString(), timestamp };
      const signature = await signMessageAsync({
        message: stringify(payload),
      });

      const result = await requestFundingDeposit({
        ...payload,
        signature,
      });

      await queryClient.invalidateQueries({
        queryKey: getFundingSnapshotQueryKey(walletSession.address),
      });

      return result;
    },
  });
}

export function useWithdraw() {
  const queryClient = useQueryClient();
  const walletSession = useWalletSession();
  const { signMessageAsync } = useSignMessage();

  return useMutation({
    mutationFn: async (amountHuman: string) => {
      if (!walletSession.address) {
        throw new Error("Connect your wallet to withdraw.");
      }

      const parsed = parseUnits(amountHuman, CONFIDENTIAL_USDC_DECIMALS);
      if (parsed <= BigInt(0)) {
        throw new Error("Enter an amount greater than zero.");
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const payload = { amount: parsed.toString(), timestamp };
      const signature = await signMessageAsync({
        message: stringify(payload),
      });

      const result = await requestFundingWithdrawal({
        ...payload,
        signature,
      });

      await queryClient.invalidateQueries({
        queryKey: getFundingSnapshotQueryKey(walletSession.address),
      });

      return result;
    },
  });
}
