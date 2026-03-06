import { HttpLink } from "@apollo/client";
import {
  registerApolloClient,
  ApolloClient,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";
import { GraphQLClient } from "graphql-request";

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/1743303/insider-streams/version/latest";

// Apollo Client — for React Server Components (query, PreloadQuery)
export const { getClient, query, PreloadQuery } = registerApolloClient(() => {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({ uri: SUBGRAPH_URL }),
  });
});

// graphql-request client — for Next.js API routes (server-side getSdk())
export const graphqlClient = new GraphQLClient(SUBGRAPH_URL);
