import { HttpLink } from "@apollo/client";
import {
  registerApolloClient,
  ApolloClient,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";
import { GraphQLClient } from "graphql-request";
import { SUBGRAPH_REQUEST_HEADERS, SUBGRAPH_URL } from "@/lib/subgraph-config";

// Apollo Client — for React Server Components (query, PreloadQuery)
export const { getClient, query, PreloadQuery } = registerApolloClient(() => {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: SUBGRAPH_URL,
      headers: SUBGRAPH_REQUEST_HEADERS,
    }),
  });
});

// graphql-request client — for Next.js API routes (server-side getSdk())
export const graphqlClient = new GraphQLClient(SUBGRAPH_URL, {
  headers: SUBGRAPH_REQUEST_HEADERS,
});
