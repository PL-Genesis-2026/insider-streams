"use client";

import { HttpLink } from "@apollo/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ApolloNextAppProvider,
  ApolloClient,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";
import { AppKitProvider } from "@reown/appkit/react";
import { useState } from "react";
import { cookieToInitialState, WagmiProvider } from "wagmi";
import {
  walletConfig,
  wagmiAdapter,
  walletProjectId,
  requiredChain,
} from "@/lib/wallet/config";
import { SUBGRAPH_URL, SUBGRAPH_REQUEST_HEADERS } from "@/lib/subgraph-config";
import { PrivateDataProvider } from "@/lib/private-data/private-data-provider";

function makeClient() {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({ uri: SUBGRAPH_URL, headers: SUBGRAPH_REQUEST_HEADERS }),
  });
}

const appKitConfig = {
  adapters: [wagmiAdapter],
  projectId: walletProjectId,
  networks: [requiredChain] as [typeof requiredChain, ...typeof requiredChain[]],
  defaultNetwork: requiredChain,
  features: {
    analytics: false,
    email: false,
    history: false,
    onramp: false,
    pay: false,
    receive: false,
    send: false,
    socials: false as const,
    swaps: false,
  },
};

export function Providers({
  children,
  cookies,
}: {
  children: React.ReactNode;
  cookies: string | null;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const initialState = cookieToInitialState(walletConfig, cookies ?? undefined);

  return (
    <AppKitProvider {...appKitConfig}>
      <ApolloNextAppProvider makeClient={makeClient}>
        <WagmiProvider config={walletConfig} initialState={initialState}>
          <QueryClientProvider client={queryClient}>
            <PrivateDataProvider>
              {children}
            </PrivateDataProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </ApolloNextAppProvider>
    </AppKitProvider>
  );
}
