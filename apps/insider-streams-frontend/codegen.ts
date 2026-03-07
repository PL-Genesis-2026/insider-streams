import type { CodegenConfig } from "@graphql-codegen/cli";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const subgraphUrl = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
const usesGraphGateway =
  subgraphUrl?.includes("gateway.thegraph.com/api/subgraphs/id/") ?? false;

if (!subgraphUrl) {
  throw new Error("NEXT_PUBLIC_SUBGRAPH_URL is required for GraphQL codegen.");
}

const schema =
  usesGraphGateway && process.env.THE_GRAPH_API_KEY
    ? ["http://127.0.0.1:3001/api/subgraph"]
    : process.env.THE_GRAPH_API_KEY
      ? [
          {
            [subgraphUrl]: {
              headers: {
                Authorization: `Bearer ${process.env.THE_GRAPH_API_KEY}`,
              },
            },
          },
        ]
      : [subgraphUrl];

const sharedConfig = {
  scalars: {
    BigDecimal: "string",
    BigInt: "string",
    Bytes: "string",
    Int8: "string",
    Timestamp: "string",
  },
  useTypeImports: true,
} as const;

const config: CodegenConfig = {
  overwrite: true,
  schema,
  documents: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.graphql"],
  ignoreNoDocuments: true,
  generates: {
    // TypedDocumentNode constants — for Apollo Client useQuery/useMutation
    "src/__generated__/graphql.ts": {
      config: sharedConfig,
      plugins: ["typescript", "typescript-operations", "typed-document-node"],
    },
    // getSdk() — for graphql-request in Next.js API routes
    "src/__generated__/sdk.ts": {
      config: sharedConfig,
      plugins: [
        "typescript",
        "typescript-operations",
        "typescript-graphql-request",
      ],
    },
    "./graphql.schema.json": {
      plugins: ["introspection"],
    },
  },
};

export default config;
