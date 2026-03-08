"use client";

import { useCallback } from "react";
import stringify from "fast-json-stable-stringify";
import { useAccount, useWalletClient } from "wagmi";

export type SignedWalletSession = {
  signature: string;
  timestamp: number;
};

const SIGNATURE_MAX_AGE_SECONDS = 570;

const signedSessionCache = new Map<string, SignedWalletSession>();

function isSessionValid(
  session: SignedWalletSession | undefined,
): session is SignedWalletSession {
  return (
    session !== undefined &&
    Date.now() / 1000 - session.timestamp < SIGNATURE_MAX_AGE_SECONDS
  );
}

export function useSignedWalletSession() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const getSignedSession =
    useCallback(async (): Promise<SignedWalletSession> => {
      if (!isConnected || !address) {
        throw new Error("Connect wallet to continue.");
      }

      if (!walletClient) {
        throw new Error("Wallet client not available. Please try again.");
      }

      const cacheKey = address.toLowerCase();
      const cachedSession = signedSessionCache.get(cacheKey);

      if (isSessionValid(cachedSession)) {
        return cachedSession;
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const message = stringify({ timestamp });
      const signature = await walletClient.signMessage({ message });
      const session = { signature, timestamp };

      signedSessionCache.set(cacheKey, session);

      return session;
    }, [address, isConnected, walletClient]);

  return {
    canSign: isConnected && Boolean(address) && Boolean(walletClient),
    getSignedSession,
  };
}
