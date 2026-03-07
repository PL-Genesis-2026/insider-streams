import type { CodegenConfig } from "@graphql-codegen/cli";

// Codegen always uses the Studio URL (no auth required).
// The gateway URL (NEXT_PUBLIC_SUBGRAPH_URL) is only for runtime queries.
const STUDIO_URL =
  "https://api.studio.thegraph.com/query/1743303/insider-streams-2/version/latest";

const schema = [STUDIO_URL];

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
