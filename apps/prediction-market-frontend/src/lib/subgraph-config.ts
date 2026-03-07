import { env } from "@/env";

const GRAPH_GATEWAY_PATH = "gateway.thegraph.com/api/subgraphs/id/";

export const SUBGRAPH_URL = env.NEXT_PUBLIC_SUBGRAPH_URL;

export const SUBGRAPH_REQUEST_HEADERS: Record<string, string> = (() => {
  if (!SUBGRAPH_URL.includes(GRAPH_GATEWAY_PATH)) {
    const headers: Record<string, string> = {};
    return headers;
  }

  const apiKey = env.NEXT_PUBLIC_SUBGRAPH_API_KEY;

  if (!apiKey) {
    throw new Error(
      "NEXT_PUBLIC_SUBGRAPH_API_KEY is required when NEXT_PUBLIC_SUBGRAPH_URL points to The Graph gateway.",
    );
  }

  return {
    Authorization: `Bearer ${apiKey}`,
  };
})();
