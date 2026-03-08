import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    OWNER_PK: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .optional(),
    RPC_URL: z.string().url().optional().default("https://eth-sepolia.g.alchemy.com/v2/59LCREaM5uGpTVXZgR8A7z6IiULWjwG6"),
  },
  client: {
    NEXT_PUBLIC_PROJECT_ID: z.string().min(1).optional(),
    NEXT_PUBLIC_RPC_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUBGRAPH_URL: z.string().url(),
    NEXT_PUBLIC_SUBGRAPH_API_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1).optional(),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1).optional(),
    NEXT_PUBLIC_INSIDER_STREAMS_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    OWNER_PK: process.env.OWNER_PK,
    RPC_URL: process.env.RPC_URL,
    NEXT_PUBLIC_PROJECT_ID: process.env.NEXT_PUBLIC_PROJECT_ID,
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
    NEXT_PUBLIC_SUBGRAPH_URL: process.env.NEXT_PUBLIC_SUBGRAPH_URL,
    NEXT_PUBLIC_SUBGRAPH_API_KEY: process.env.NEXT_PUBLIC_SUBGRAPH_API_KEY,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_INSIDER_STREAMS_URL:
      process.env.NEXT_PUBLIC_INSIDER_STREAMS_URL,
  },
  emptyStringAsUndefined: true,
});
