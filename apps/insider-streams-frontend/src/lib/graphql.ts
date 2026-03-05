import { GraphQLClient } from "graphql-request";

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ??
  "https://gateway.thegraph.com/api/subgraphs/id/GiEXREmvxbqNfQ3VxnhjKypYRNvEaeVjtAWncPHzPiuj";

export const graphqlClient = new GraphQLClient(SUBGRAPH_URL);
