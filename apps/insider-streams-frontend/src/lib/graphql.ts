import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
import { GraphQLClient } from "graphql-request";

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ??
  "https://gateway.thegraph.com/api/subgraphs/id/GiEXREmvxbqNfQ3VxnhjKypYRNvEaeVjtAWncPHzPiuj";

// Apollo Client — for React components (useQuery, useMutation)
export const apolloClient = new ApolloClient({
  link: new HttpLink({ uri: SUBGRAPH_URL }),
  cache: new InMemoryCache(),
});

// graphql-request client — for Next.js API routes (server-side getSdk())
export const graphqlClient = new GraphQLClient(SUBGRAPH_URL);
