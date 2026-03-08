"use client";

import { createAppKit } from "@reown/appkit/react";
import { sepolia } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { cookieStorage, createStorage, http } from "wagmi";
import { env } from "@/env";

export const requiredChain = sepolia;
const configuredWalletProjectId = env.NEXT_PUBLIC_PROJECT_ID;
export const walletProjectId = configuredWalletProjectId ?? null;
export const walletEnabled = configuredWalletProjectId !== undefined;
export const walletNetworks = [requiredChain] as const;
const APPKIT_INSTANCE_KEY = "__prediction_market_appkit__";

const wagmiAdapter = configuredWalletProjectId
  ? new WagmiAdapter({
      projectId: configuredWalletProjectId,
      networks: [...walletNetworks],
      ssr: true,
      storage: createStorage({
        storage: cookieStorage,
      }),
      transports: {
        [requiredChain.id]: http("https://eth-sepolia.g.alchemy.com/v2/59LCREaM5uGpTVXZgR8A7z6IiULWjwG6"),
      },
    })
  : null;

type GlobalAppKit = typeof globalThis & {
  __prediction_market_appkit__?: ReturnType<typeof createAppKit>;
};

const globalAppKit = globalThis as GlobalAppKit;

export function ensureAppKit() {
  if (!wagmiAdapter || !configuredWalletProjectId) {
    return null;
  }

  const existingAppKit = globalAppKit[APPKIT_INSTANCE_KEY];

  if (existingAppKit) {
    return existingAppKit;
  }

  const createdAppKit = createAppKit({
    adapters: [wagmiAdapter],
    projectId: configuredWalletProjectId,
    networks: [...walletNetworks],
    defaultNetwork: requiredChain,
    features: {
      analytics: false,
      email: false,
      history: false,
      onramp: false,
      pay: false,
      receive: false,
      send: false,
      socials: false,
      swaps: false,
    },
  });

  globalAppKit[APPKIT_INSTANCE_KEY] = createdAppKit;

  return createdAppKit;
}

export const walletConfig = wagmiAdapter?.wagmiConfig ?? null;
