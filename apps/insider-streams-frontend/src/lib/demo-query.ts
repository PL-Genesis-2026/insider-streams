/**
 * Demo queries to verify codegen setup is working.
 * Delete this file once real queries are in place.
 *
 * Apollo hook usage (React component):
 *   import { useRecentAuctions } from "@/lib/demo-query";
 *   const { data, loading, error } = useRecentAuctions();
 *
 * API route usage (server-side):
 *   import { getSubgraphSdk } from "@/lib/demo-query";
 *   const sdk = getSubgraphSdk();
 *   const data = await sdk.RecentAuctions();
 */
import { useQuery } from "@apollo/client/react";
import { GraphQLClient } from "graphql-request";
import { RecentAuctionsDocument } from "../__generated__/graphql";
import { getSdk } from "../__generated__/sdk";
import { graphqlClient } from "./graphql";

// Apollo hook — for React components
export function useRecentAuctions() {
  return useQuery(RecentAuctionsDocument);
}

// getSdk — for Next.js API routes (server-side)
export function getSubgraphSdk(client?: GraphQLClient) {
  return getSdk(client ?? graphqlClient);
}
