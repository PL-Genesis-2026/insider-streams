import type { CodegenConfig } from "@graphql-codegen/cli";

const STUDIO_URL =
  "https://api.studio.thegraph.com/query/1743303/insider-streams/version/latest";

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
    "src/__generated__/graphql.ts": {
      config: {
        ...sharedConfig,
        enumsAsTypes: true,
      },
      plugins: ["typescript", "typescript-operations", "typed-document-node"],
    },
    "./graphql.schema.json": {
      plugins: ["introspection"],
    },
  },
};

export default config;
