/**
 * Demo queries to verify codegen setup is working.
 * Delete this file once real queries are in place.
 *
 * Client component usage (useQuery hook):
 *   import { useRecentAuctions } from "@/lib/demo-query";
 *   const { data, loading, error } = useRecentAuctions();
 *
 * Server component usage (RSC):
 *   import { queryRecentAuctions } from "@/lib/demo-query";
 *   const { data } = await queryRecentAuctions();
 *
 * API route usage (server-side getSdk):
 *   import { getSubgraphSdk } from "@/lib/demo-query";
 *   const sdk = getSubgraphSdk();
 *   const data = await sdk.RecentAuctions();
 */
import { useSuspenseQuery } from "@apollo/client/react";
import { GraphQLClient } from "graphql-request";
import { RecentAuctionsDocument } from "../__generated__/graphql";
import { getSdk } from "../__generated__/sdk";
import { query, graphqlClient } from "./graphql";

// Apollo hook — for client components (wrap in Suspense boundary)
export function useRecentAuctions() {
  return useSuspenseQuery(RecentAuctionsDocument);
}

// Apollo RSC — for React Server Components
export function queryRecentAuctions() {
  return query({ query: RecentAuctionsDocument });
}

// getSdk — for Next.js API routes (server-side)
export function getSubgraphSdk(client?: GraphQLClient) {
  return getSdk(client ?? graphqlClient);
}
