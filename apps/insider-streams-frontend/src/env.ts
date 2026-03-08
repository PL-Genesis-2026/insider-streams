import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    OWNER_PK: z.string().min(1).optional(),
    SECRET_MARKETPLACE_ADDRESS: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .optional(),
    EXAMPLE_PREDICTION_MARKET_ADDRESS: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .optional(),
    RPC_URL: z
      .string()
      .url()
      .optional()
      .default("https://eth-sepolia.g.alchemy.com/v2/59LCREaM5uGpTVXZgR8A7z6IiULWjwG6"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_PROJECT_ID: z.string().min(1),
    NEXT_PUBLIC_SUBGRAPH_URL: z.url(),
    // Public because Subgraph Studio doesn't offer granular API key controls;
    // key has a low query budget to limit abuse.
    NEXT_PUBLIC_SUBGRAPH_API_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_EXTERNAL_PREDICTION_MARKET_BASE_URL: z
      .string()
      .optional()
      .default("http://localhost:3002"),
  },
  runtimeEnv: {
    OWNER_PK: process.env.OWNER_PK,
    SECRET_MARKETPLACE_ADDRESS: process.env.SECRET_MARKETPLACE_ADDRESS,
    EXAMPLE_PREDICTION_MARKET_ADDRESS:
      process.env.EXAMPLE_PREDICTION_MARKET_ADDRESS,
    RPC_URL: process.env.RPC_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_PROJECT_ID: process.env.NEXT_PUBLIC_PROJECT_ID,
    NEXT_PUBLIC_SUBGRAPH_URL: process.env.NEXT_PUBLIC_SUBGRAPH_URL,
    NEXT_PUBLIC_SUBGRAPH_API_KEY: process.env.NEXT_PUBLIC_SUBGRAPH_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_EXTERNAL_PREDICTION_MARKET_BASE_URL:
      process.env.NEXT_PUBLIC_EXTERNAL_PREDICTION_MARKET_BASE_URL,
  },
  emptyStringAsUndefined: true,
});
