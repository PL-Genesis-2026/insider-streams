"use client";

import { useAppKitAccount } from "@reown/appkit/react";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { getAddress, isAddress, type Address } from "viem";
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
  const appKitAccount = useAppKitAccount({ namespace: "eip155" });
  const wagmiAccount = useAccount();

  return useMemo(() => {
    const appKitAddress = appKitAccount.address;
    const resolvedAddress =
      appKitAddress && isAddress(appKitAddress)
        ? getAddress(appKitAddress)
        : wagmiAccount.address;
    const isConnected = appKitAccount.isConnected || wagmiAccount.isConnected;
    const currentChainId = wagmiAccount.chainId;

    return {
      address: resolvedAddress,
      currentChainId,
      currentChainName: wagmiAccount.chain?.name,
      connectorName: wagmiAccount.connector?.name,
      isConnected,
      isSupportedChain:
        !isConnected || currentChainId === requiredChain.id,
      requiredChainId: requiredChain.id,
      requiredChainName: requiredChain.name,
    };
  }, [
    appKitAccount.address,
    appKitAccount.isConnected,
    wagmiAccount.address,
    wagmiAccount.chain?.name,
    wagmiAccount.chainId,
    wagmiAccount.connector?.name,
    wagmiAccount.isConnected,
  ]);
}
