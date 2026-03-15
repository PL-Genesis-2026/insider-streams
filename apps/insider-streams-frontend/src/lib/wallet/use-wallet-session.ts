"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { type Address } from "viem";
import { requiredChain } from "./config";

export type WalletSession = {
  address?: Address;
  currentChainId?: number;
  currentChainName?: string;
  connectorName?: string;
  isConnected: boolean;
  isSupportedChain: boolean;
  requiredChainId: number;
  requiredChainName: string;
};

export function useWalletSession(): WalletSession {
  const wagmiAccount = useAccount();

  return useMemo(() => {
    const currentChainId = wagmiAccount.chainId;

    return {
      address: wagmiAccount.address,
      currentChainId,
      currentChainName: wagmiAccount.chain?.name,
      connectorName: wagmiAccount.connector?.name,
      isConnected: wagmiAccount.isConnected,
      isSupportedChain:
        currentChainId === undefined || currentChainId === requiredChain.id,
      requiredChainId: requiredChain.id,
      requiredChainName: requiredChain.name,
    };
  }, [
    wagmiAccount.address,
    wagmiAccount.chain?.name,
    wagmiAccount.chainId,
    wagmiAccount.connector?.name,
    wagmiAccount.isConnected,
  ]);
}
