import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {},
  client: {
    NEXT_PUBLIC_SUBGRAPH_URL: z.string().url(),
    NEXT_PUBLIC_SUBGRAPH_API_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1).optional(),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SUBGRAPH_URL: process.env.NEXT_PUBLIC_SUBGRAPH_URL,
    NEXT_PUBLIC_SUBGRAPH_API_KEY: process.env.NEXT_PUBLIC_SUBGRAPH_API_KEY,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  },
  emptyStringAsUndefined: true,
});
