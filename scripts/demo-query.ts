/**
 * Demo query to verify graphql-codegen setup is working.
 * Delete this file (and queries/demo.graphql) once real queries are in place.
 *
 * Run: npx tsx demo-query.ts
 */
import { GraphQLClient } from "graphql-request";
import { getSdk } from "./__generated__/graphql";

// Studio URL (free, rate-limited) — use Gateway URL with API key for production
const SUBGRAPH_URL =
  "https://api.studio.thegraph.com/query/1743303/insider-streams-2/version/latest";

async function main() {
  const client = new GraphQLClient(SUBGRAPH_URL);
  const sdk = getSdk(client);

  console.log("SDK methods:", Object.keys(sdk));

  const data = await sdk.RecentAuctions();
  console.log(
    "Recent auctions:",
    JSON.stringify(data.auctionCreateds, null, 2),
  );
  console.log("Recent bids:", JSON.stringify(data.bidPlaceds, null, 2));
}

main().catch(console.error);
