/**
 * Load the Zama Relayer SDK via CDN script tag.
 *
 * The SDK includes WASM modules that are difficult to bundle with Next.js.
 * Loading via CDN (same approach as Zama's official ERC-7984 demo app) avoids
 * webpack/turbopack WASM issues. The npm package (@zama-fhe/relayer-sdk) is
 * installed for TypeScript types only.
 *
 * Once loaded, the SDK is available at `window.relayerSDK`.
 */

import type { FhevmInstance } from "@zama-fhe/relayer-sdk/web";

export type { FhevmInstance };

// Match the version in package.json
const SDK_CDN_URL =
  "https://cdn.zama.org/relayer-sdk-js/0.4.2/relayer-sdk-js.umd.cjs";

type RelayerSDK = {
  initSDK: (options?: unknown) => Promise<boolean>;
  createInstance: (config: Record<string, unknown>) => Promise<FhevmInstance>;
  SepoliaConfig: Record<string, unknown>;
  __initialized__?: boolean;
};

declare global {
  interface Window {
    relayerSDK?: RelayerSDK;
  }
}

let loadPromise: Promise<void> | null = null;

function isLoaded(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.relayerSDK &&
    typeof window.relayerSDK.createInstance === "function"
  );
}

function loadScript(): Promise<void> {
  if (isLoaded()) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Relayer SDK can only be loaded in the browser"));
      return;
    }

    const existing = document.querySelector(`script[src="${SDK_CDN_URL}"]`);
    if (existing) {
      if (isLoaded()) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error("Failed to load Relayer SDK")),
        );
      }
      return;
    }

    const script = document.createElement("script");
    script.src = SDK_CDN_URL;
    script.type = "text/javascript";
    script.async = true;
    script.onload = () => {
      if (!isLoaded()) {
        reject(new Error("Relayer SDK loaded but window.relayerSDK is invalid"));
        return;
      }
      resolve();
    };
    script.onerror = () =>
      reject(new Error(`Failed to load Relayer SDK from ${SDK_CDN_URL}`));
    document.head.appendChild(script);
  });

  return loadPromise;
}

let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (window.relayerSDK?.__initialized__) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const ok = await window.relayerSDK!.initSDK();
    if (!ok) throw new Error("relayerSDK.initSDK() returned false");
    window.relayerSDK!.__initialized__ = true;
  })();

  return initPromise;
}

/**
 * Load the SDK script + initialize WASM. Returns the SDK namespace.
 * Safe to call multiple times — deduplicates.
 */
export async function loadRelayerSDK(): Promise<RelayerSDK> {
  await loadScript();
  await ensureInitialized();
  return window.relayerSDK!;
}
