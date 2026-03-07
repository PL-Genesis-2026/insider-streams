"use client";

import { createAppKit } from "@reown/appkit/react";
import { sepolia } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { cookieStorage, createStorage, http } from "wagmi";
import { env } from "@/env";

export const requiredChain = sepolia;
export const walletProjectId = env.NEXT_PUBLIC_PROJECT_ID;
export const walletNetworks = [requiredChain] as const;
const APPKIT_INSTANCE_KEY = "__insider_streams_appkit__";

const wagmiAdapter = new WagmiAdapter({
  projectId: walletProjectId,
  networks: [...walletNetworks],
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
  transports: {
    [requiredChain.id]: http("https://ethereum-sepolia-rpc.publicnode.com"),
  },
});

type GlobalAppKit = typeof globalThis & {
  __insider_streams_appkit__?: ReturnType<typeof createAppKit>;
};

const globalAppKit = globalThis as GlobalAppKit;

export const appKit =
  globalAppKit[APPKIT_INSTANCE_KEY] ??
  createAppKit({
  adapters: [wagmiAdapter],
  projectId: walletProjectId,
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

globalAppKit[APPKIT_INSTANCE_KEY] = appKit;

export const walletConfig = wagmiAdapter.wagmiConfig;
