import { HttpLink } from "@apollo/client";
import {
  registerApolloClient,
  ApolloClient,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";
import {
  SUBGRAPH_REQUEST_HEADERS,
  SUBGRAPH_URL,
} from "@/lib/subgraph-config";

export const { getClient, query, PreloadQuery } = registerApolloClient(() => {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: SUBGRAPH_URL,
      headers: SUBGRAPH_REQUEST_HEADERS,
    }),
  });
});
