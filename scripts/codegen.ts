import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  overwrite: true,
  schema:
    "https://api.studio.thegraph.com/query/1743303/insider-streams-2/version/latest",
  documents: ["**/*.graphql", "*.ts", "!codegen.ts"],
  generates: {
    "__generated__/graphql.ts": {
      config: {
        enumsAsTypes: true,
      },
      plugins: [
        "typescript",
        "typescript-operations",
        "typescript-graphql-request",
      ],
    },
  },
  ignoreNoDocuments: true,
};

export default config;
