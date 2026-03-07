"use client";

import { createAppKit } from "@reown/appkit/react";
import { sepolia } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { cookieStorage, createStorage, http } from "wagmi";
import { env } from "@/env";

export const requiredChain = sepolia;
export const walletProjectId = env.NEXT_PUBLIC_PROJECT_ID;
export const walletNetworks = [requiredChain] as const;

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

export const walletConfig = wagmiAdapter.wagmiConfig;
