"use client";

import { HttpLink } from "@apollo/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ApolloNextAppProvider,
  ApolloClient,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";
import { useState } from "react";
import { cookieToInitialState, WagmiProvider } from "wagmi";
import { walletConfig } from "@/lib/wallet/config";

const SUBGRAPH_PROXY_PATH = "/api/subgraph";

function makeClient() {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({ uri: SUBGRAPH_PROXY_PATH }),
  });
}

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
    <ApolloNextAppProvider makeClient={makeClient}>
      <WagmiProvider config={walletConfig} initialState={initialState}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </ApolloNextAppProvider>
  );
}
