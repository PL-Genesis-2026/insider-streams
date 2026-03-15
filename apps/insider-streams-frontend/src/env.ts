import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
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
      .default("https://ethereum-sepolia-rpc.publicnode.com"),
    DAEMON_API_URL: z
      .string()
      .url()
      .optional()
      .default("http://localhost:3001"),
    OWNER_PK: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_PROJECT_ID: z.string().min(1),
    NEXT_PUBLIC_SUBGRAPH_URL: z.url(),
    NEXT_PUBLIC_SUBGRAPH_API_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_EXTERNAL_PREDICTION_MARKET_BASE_URL: z
      .string()
      .optional()
      .default("http://localhost:3002"),
  },
  runtimeEnv: {
    SECRET_MARKETPLACE_ADDRESS: process.env.SECRET_MARKETPLACE_ADDRESS,
    EXAMPLE_PREDICTION_MARKET_ADDRESS:
      process.env.EXAMPLE_PREDICTION_MARKET_ADDRESS,
    RPC_URL: process.env.RPC_URL,
    DAEMON_API_URL: process.env.DAEMON_API_URL,
    OWNER_PK: process.env.OWNER_PK,
    NEXT_PUBLIC_PROJECT_ID: process.env.NEXT_PUBLIC_PROJECT_ID,
    NEXT_PUBLIC_SUBGRAPH_URL: process.env.NEXT_PUBLIC_SUBGRAPH_URL,
    NEXT_PUBLIC_SUBGRAPH_API_KEY: process.env.NEXT_PUBLIC_SUBGRAPH_API_KEY,
    NEXT_PUBLIC_EXTERNAL_PREDICTION_MARKET_BASE_URL:
      process.env.NEXT_PUBLIC_EXTERNAL_PREDICTION_MARKET_BASE_URL,
  },
  emptyStringAsUndefined: true,
});
