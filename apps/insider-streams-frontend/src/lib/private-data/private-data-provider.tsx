"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import stringify from "fast-json-stable-stringify";
import type {
  PrivateSellerRecord,
  PrivateBidRecord,
  PrivateSecretRecord,
} from "./types";
import { fetchMySeller, fetchMyBids, fetchMySecrets } from "./api";

// ---------------------------------------------------------------------------
// Signature session — reuse within 9.5 min (570s) of the 10 min TTL
// ---------------------------------------------------------------------------

type StoredSession = { signature: string; timestamp: number };

const SIGNATURE_MAX_AGE_SECONDS = 570; // 30s safety margin before 600s TTL

function isSessionValid(session: StoredSession | null): session is StoredSession {
  if (!session) return false;
  return Date.now() / 1000 - session.timestamp < SIGNATURE_MAX_AGE_SECONDS;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type PrivateDataContextValue = {
  // State
  isRevealed: boolean;
  isLoading: boolean;
  error: string | null;

  // Data accessors
  seller: PrivateSellerRecord | null;
  getBid: (auctionId: string) => PrivateBidRecord | undefined;
  getSecret: (auctionId: string) => PrivateSecretRecord | undefined;

  // Actions
  revealForAuctions: (auctionIds: string[]) => Promise<void>;
  registerVisibleAuctions: (key: string, ids: string[]) => void;
  unregisterVisibleAuctions: (key: string) => void;
  getVisibleAuctionIds: () => string[];
};

export const PrivateDataContext =
  createContext<PrivateDataContextValue | null>(null);

// ---------------------------------------------------------------------------
// React Query cache keys & stale times
// ---------------------------------------------------------------------------

const SELLER_STALE_TIME = 1_800_000; // 30 min
const BIDS_STALE_TIME = 30_000; // 30 sec
const SECRETS_STALE_TIME = 300_000; // 5 min

function sellerKey(address: string) {
  return ["private-seller", address] as const;
}
function bidsKey(address: string) {
  return ["private-bids", address] as const;
}
function secretsKey(address: string) {
  return ["private-secrets", address] as const;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Provides authenticated access to private auction data (seller info, bids,
 * secrets) for the connected wallet.
 *
 * - Signs a message once and reuses it for up to 9.5 min (10 min server TTL)
 * - Fetches seller, bids, and secrets in parallel on reveal
 * - Caches via React Query (seller: 30 min, bids: 30 s, secrets: 5 min)
 * - Components register which auctions are on-screen so the reveal button
 *   knows what to fetch
 * - Clears all data on wallet disconnect
 *
 * Consume via the `usePrivateData()` hook.
 */
export function PrivateDataProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { open } = useAppKit();
  const queryClient = useQueryClient();

  const sessionRef = useRef<StoredSession | null>(null);
  const visibleAuctionsRef = useRef<Map<string, string[]>>(new Map());

  const [isRevealed, setIsRevealed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- React Query: read cached data ---------------------------------

  const { data: sellerData } = useQuery<PrivateSellerRecord | null>({
    queryKey: address ? sellerKey(address) : ["private-seller", "__none__"],
    queryFn: () => null, // populated via setQueryData
    enabled: false,
    staleTime: SELLER_STALE_TIME,
  });

  const { data: bidsData } = useQuery<Record<string, PrivateBidRecord>>({
    queryKey: address ? bidsKey(address) : ["private-bids", "__none__"],
    queryFn: () => ({}), // populated via setQueryData
    enabled: false,
    staleTime: BIDS_STALE_TIME,
  });

  const { data: secretsData } = useQuery<Record<string, PrivateSecretRecord>>({
    queryKey: address ? secretsKey(address) : ["private-secrets", "__none__"],
    queryFn: () => ({}), // populated via setQueryData
    enabled: false,
    staleTime: SECRETS_STALE_TIME,
  });

  // ---- Visible auction registration ----------------------------------

  const registerVisibleAuctions = useCallback(
    (key: string, ids: string[]) => {
      visibleAuctionsRef.current.set(key, ids);
    },
    [],
  );

  const unregisterVisibleAuctions = useCallback((key: string) => {
    visibleAuctionsRef.current.delete(key);
  }, []);

  const getVisibleAuctionIds = useCallback((): string[] => {
    const all = new Set<string>();
    for (const ids of visibleAuctionsRef.current.values()) {
      for (const id of ids) {
        all.add(id);
      }
    }
    return [...all];
  }, []);

  // ---- Data accessors -------------------------------------------------

  const getBid = useCallback(
    (auctionId: string): PrivateBidRecord | undefined => {
      return bidsData?.[auctionId];
    },
    [bidsData],
  );

  const getSecret = useCallback(
    (auctionId: string): PrivateSecretRecord | undefined => {
      return secretsData?.[auctionId];
    },
    [secretsData],
  );

  // ---- revealForAuctions ----------------------------------------------

  const revealForAuctions = useCallback(
    async (auctionIds: string[]) => {
      // 1. Ensure wallet is connected
      if (!isConnected || !address) {
        void open({ view: "Connect" });
        return;
      }

      if (!walletClient) {
        setError("Wallet client not available. Please try again.");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // 2. Get or create signature
        let session = sessionRef.current;
        if (!isSessionValid(session)) {
          const timestamp = Math.floor(Date.now() / 1000);
          const message = stringify({ timestamp });
          const signature = await walletClient.signMessage({ message });
          session = { signature, timestamp };
          sessionRef.current = session;
        }

        const { signature, timestamp } = session;

        // 3. Parallel fetch
        const [sellerResult, bidsResult, secretsResult] =
          await Promise.allSettled([
            fetchMySeller(signature, timestamp),
            fetchMyBids(signature, timestamp, auctionIds),
            fetchMySecrets(signature, timestamp, auctionIds),
          ]);

        // 4. Merge results into React Query cache
        if (sellerResult.status === "fulfilled") {
          queryClient.setQueryData(
            sellerKey(address),
            sellerResult.value,
          );
        }

        if (bidsResult.status === "fulfilled") {
          queryClient.setQueryData(
            bidsKey(address),
            (existing: Record<string, PrivateBidRecord> | undefined) => ({
              ...existing,
              ...bidsResult.value,
            }),
          );
        }

        if (secretsResult.status === "fulfilled") {
          queryClient.setQueryData(
            secretsKey(address),
            (existing: Record<string, PrivateSecretRecord> | undefined) => ({
              ...existing,
              ...secretsResult.value,
            }),
          );
        }

        // Collect errors from rejected promises
        const errors: string[] = [];
        if (sellerResult.status === "rejected") {
          errors.push(`Seller: ${String(sellerResult.reason)}`);
        }
        if (bidsResult.status === "rejected") {
          errors.push(`Bids: ${String(bidsResult.reason)}`);
        }
        if (secretsResult.status === "rejected") {
          errors.push(`Secrets: ${String(secretsResult.reason)}`);
        }

        if (errors.length > 0) {
          setError(errors.join("; "));
        }

        // 5. Mark as revealed even if some requests failed (partial data is OK)
        setIsRevealed(true);
      } catch (err) {
        // signMessage rejection or other unexpected errors
        const message =
          err instanceof Error ? err.message : "Failed to reveal private data";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [isConnected, address, walletClient, open, queryClient],
  );

  // ---- Wallet disconnect cleanup --------------------------------------

  useEffect(() => {
    if (!isConnected) {
      // Clear all private-data queries
      queryClient.removeQueries({ queryKey: ["private-seller"] });
      queryClient.removeQueries({ queryKey: ["private-bids"] });
      queryClient.removeQueries({ queryKey: ["private-secrets"] });
      setIsRevealed(false);
      setError(null);
      sessionRef.current = null;
    }
  }, [isConnected, queryClient]);

  // ---- Context value ---------------------------------------------------

  const value: PrivateDataContextValue = {
    isRevealed,
    isLoading,
    error,
    seller: sellerData ?? null,
    getBid,
    getSecret,
    revealForAuctions,
    registerVisibleAuctions,
    unregisterVisibleAuctions,
    getVisibleAuctionIds,
  };

  return (
    <PrivateDataContext.Provider value={value}>
      {children}
    </PrivateDataContext.Provider>
  );
}
