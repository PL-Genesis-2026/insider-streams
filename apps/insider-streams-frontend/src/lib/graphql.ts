import { HttpLink } from "@apollo/client";
import {
  registerApolloClient,
  ApolloClient,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";
import { GraphQLClient } from "graphql-request";
import { env } from "@/env";

const STUDIO_SUBGRAPH_URL =
  "https://api.studio.thegraph.com/query/1743303/insider-streams-2/version/latest";

function resolveSubgraphUrl(url: string) {
  // The Graph gateway URL requires an auth header in this project setup, so
  // fallback to the studio endpoint when a public URL is needed.
  if (url.includes("gateway.thegraph.com/api/subgraphs/id/")) {
    return STUDIO_SUBGRAPH_URL;
  }

  return url;
}

const SUBGRAPH_URL = resolveSubgraphUrl(env.NEXT_PUBLIC_SUBGRAPH_URL);

// Apollo Client — for React Server Components (query, PreloadQuery)
export const { getClient, query, PreloadQuery } = registerApolloClient(() => {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({ uri: SUBGRAPH_URL }),
  });
});

// graphql-request client — for Next.js API routes (server-side getSdk())
export const graphqlClient = new GraphQLClient(SUBGRAPH_URL);
