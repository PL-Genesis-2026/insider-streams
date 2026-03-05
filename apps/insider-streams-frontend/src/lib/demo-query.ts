/**
 * Demo query to verify graphql-codegen setup is working.
 * Delete this file once real queries are in place.
 *
 * Run: npx tsx --tsconfig tsconfig.json src/lib/demo-query.ts
 */
import { GraphQLClient } from "graphql-request";
import { gql } from "../__generated__/gql";

// Studio URL for demo (free, rate-limited)
const client = new GraphQLClient(
  "https://api.studio.thegraph.com/query/1743303/insider-streams/version/latest"
);

const RECENT_AUCTIONS_QUERY = gql(`
  query RecentAuctions {
    auctionCreateds(first: 5, orderBy: blockTimestamp, orderDirection: desc) {
      id
      auctionId
      seller
      reservePrice
      endTime
      blockTimestamp
      transactionHash
    }
    bidPlaceds(first: 5, orderBy: blockTimestamp, orderDirection: desc) {
      id
      auctionId
      bidder
      amount
      blockTimestamp
    }
  }
`);

async function main() {
  const data = await client.request(RECENT_AUCTIONS_QUERY);
  console.log("Recent auctions:", JSON.stringify(data.auctionCreateds, null, 2));
  console.log("Recent bids:", JSON.stringify(data.bidPlaceds, null, 2));
}

main().catch(console.error);
