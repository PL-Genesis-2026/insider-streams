"use client";

/**
 * Bridge wagmi's walletClient to ethers.js BrowserProvider + JsonRpcSigner.
 *
 * The Zama Relayer SDK's userDecrypt requires an ethers JsonRpcSigner for
 * EIP-712 signing. This hook adapts wagmi's wallet client to ethers.
 *
 * Pattern from Zama's ERC-7984 demo (packages/erc7984example/hooks/wagmi/useWagmiEthers.ts).
 */

import { useMemo } from "react";
import { BrowserProvider, JsonRpcSigner, type Eip1193Provider } from "ethers";
import { useAccount, useWalletClient } from "wagmi";

export function useWagmiEthers() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const ethersProvider = useMemo(() => {
    if (!walletClient) return undefined;

    const provider: Eip1193Provider = {
      request: async (args: { method: string; params?: unknown[] }) =>
        walletClient.request(args as never),
    };

    return new BrowserProvider(provider);
  }, [walletClient]);

  const ethersSigner = useMemo(() => {
    if (!ethersProvider || !address) return undefined;
    return new JsonRpcSigner(ethersProvider, address);
  }, [ethersProvider, address]);

  return { ethersProvider, ethersSigner } as const;
}
