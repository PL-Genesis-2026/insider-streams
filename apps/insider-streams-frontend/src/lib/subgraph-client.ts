import { GraphQLClient } from "graphql-request";
import { SUBGRAPH_URL, SUBGRAPH_REQUEST_HEADERS } from "@/lib/subgraph-config";

/**
 * Client-safe GraphQL client for the subgraph.
 *
 * Unlike `lib/graphql.ts` (which bundles Apollo for RSC), this module only
 * pulls in `graphql-request` and can be safely imported from client components.
 */
export const subgraphClient = new GraphQLClient(SUBGRAPH_URL, {
  headers: SUBGRAPH_REQUEST_HEADERS,
});
