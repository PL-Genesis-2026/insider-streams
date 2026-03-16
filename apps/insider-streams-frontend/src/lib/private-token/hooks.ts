"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CONFIDENTIAL_USDC_ADDRESS,
  CONFIDENTIAL_USDC_DECIMALS,
  PLATFORM_EOA_ADDRESS,
  fheConfidentialUsdcAbi,
} from "@private-streams/common";
import { parseUnits, toHex } from "viem";
import { useAccount, usePublicClient, useSignMessage, useWalletClient } from "wagmi";
import stringify from "fast-json-stable-stringify";
import { requestFundingDeposit } from "@/lib/funding/api";
import { requestFundingWithdrawal } from "@/lib/funding/api";
import { getFundingSnapshotQueryKey } from "@/lib/funding/queries";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";
import { useFhevm } from "@/lib/fhevm/use-fhevm";
import { useState } from "react";

export type DepositStep =
  | "idle"
  | "encrypting"
  | "confirming"
  | "transferring"
  | "notifying"
  | "done";

export function useDeposit() {
  const queryClient = useQueryClient();
  const walletSession = useWalletSession();
  const { signMessageAsync } = useSignMessage();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { instance: fhevmInstance } = useFhevm();
  const [depositStep, setDepositStep] = useState<DepositStep>("idle");

  const mutation = useMutation({
    mutationFn: async (amountHuman: string) => {
      if (!walletSession.address || !address) {
        throw new Error("Connect your wallet to deposit.");
      }
      if (!walletClient) {
        throw new Error("Wallet client not available.");
      }
      if (!publicClient) {
        throw new Error("Public client not available.");
      }
      if (!fhevmInstance) {
        throw new Error("FHE SDK not ready. Please wait a moment and try again.");
      }

      const parsed = parseUnits(amountHuman, CONFIDENTIAL_USDC_DECIMALS);
      if (parsed <= 0n) {
        throw new Error("Enter an amount greater than zero.");
      }

      // Step 1: Encrypt the amount using the Zama relayer SDK
      setDepositStep("encrypting");
      const contractAddress = CONFIDENTIAL_USDC_ADDRESS as `0x${string}`;
      const input = (fhevmInstance as any).createEncryptedInput(
        contractAddress,
        address,
      );
      input.add64(parsed);
      const encrypted = await input.encrypt();

      // Step 2: Transfer cUSDC from user's wallet to admin EOA (on-chain tx)
      setDepositStep("confirming");
      const handle = toHex(encrypted.handles[0] as Uint8Array);
      const proof = toHex(encrypted.inputProof as Uint8Array);
      const txHash = await walletClient.writeContract({
        address: contractAddress,
        abi: fheConfidentialUsdcAbi,
        functionName: "confidentialTransfer",
        args: [
          PLATFORM_EOA_ADDRESS as `0x${string}`,
          handle,
          proof,
        ],
      });

      // Wait for confirmation
      setDepositStep("transferring");
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Step 3: Notify daemon to deposit from admin → marketplace
      setDepositStep("notifying");
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = { txHash, amount: parsed.toString(), timestamp };
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

      setDepositStep("done");
      return result;
    },
    onSettled: () => {
      setTimeout(() => setDepositStep("idle"), 1500);
    },
  });

  return { ...mutation, depositStep };
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
      if (parsed <= 0n) {
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
