"use client";

/**
 * React hook to initialize the Zama FhevmInstance.
 *
 * Loads the SDK via CDN, initializes WASM, and creates the singleton instance
 * using SepoliaConfig + the user's wallet provider.
 *
 * Pattern follows Zama's official ERC-7984 demo (packages/fhevm-sdk/src/react/useFhevm.tsx).
 */

import { useEffect, useRef, useState } from "react";
import { useWalletClient } from "wagmi";
import { loadRelayerSDK, type FhevmInstance } from "./load-sdk";

type FhevmState = "idle" | "loading" | "ready" | "error";

let cachedInstance: FhevmInstance | null = null;
let initPromise: Promise<FhevmInstance> | null = null;

export function useFhevm(): {
  instance: FhevmInstance | undefined;
  status: FhevmState;
  error: Error | undefined;
} {
  const { data: walletClient } = useWalletClient();
  const [instance, setInstance] = useState<FhevmInstance | undefined>(
    cachedInstance ?? undefined,
  );
  const [status, setStatus] = useState<FhevmState>(
    cachedInstance ? "ready" : "idle",
  );
  const [error, setError] = useState<Error | undefined>();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!walletClient) return;
    if (cachedInstance) {
      setInstance(cachedInstance);
      setStatus("ready");
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;

    setStatus("loading");
    setError(undefined);

    (async () => {
      // Deduplicate concurrent init calls from multiple hook instances.
      // Without this, two useFhevm() hooks mounting simultaneously would
      // both call createInstance(), causing duplicate RPC calls that can
      // trigger rate limits (HTTP 429).
      if (!initPromise) {
        initPromise = (async () => {
          const sdk = await loadRelayerSDK();
          const provider = {
            request: async (args: { method: string; params?: unknown[] }) =>
              walletClient.request(args as never),
          };
          const config = {
            ...sdk.SepoliaConfig,
            relayerUrl: `${sdk.SepoliaConfig.relayerUrl as string}/v2`,
            network: provider,
            relayerRouteVersion: 2,
          };
          return sdk.createInstance(config);
        })();
      }

      try {
        const inst = await initPromise;
        if (abort.signal.aborted) return;
        cachedInstance = inst;
        setInstance(inst);
        setStatus("ready");
      } catch (err) {
        // Clear promise so next attempt can retry
        initPromise = null;
        throw err;
      }
    })().catch((err) => {
      if (abort.signal.aborted) return;
      console.error("[useFhevm] Failed to initialize:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setStatus("error");
    });

    return () => {
      abort.abort();
    };
  }, [walletClient]);

  return { instance, status, error };
}
