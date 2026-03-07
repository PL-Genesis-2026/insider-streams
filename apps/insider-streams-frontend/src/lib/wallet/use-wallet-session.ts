"use client";

import { useAccount } from "wagmi";
import type { Address } from "viem";
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
  const { address, chain, chainId, connector, isConnected } = useAccount();

  return {
    address,
    currentChainId: chainId,
    currentChainName: chain?.name,
    connectorName: connector?.name,
    isConnected,
    isSupportedChain: chainId === undefined || chainId === requiredChain.id,
    requiredChainId: requiredChain.id,
    requiredChainName: requiredChain.name,
  };
}
