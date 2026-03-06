import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const DEFAULT_SUBGRAPH_URL =
  "https://api.studio.thegraph.com/query/1743303/insider-streams/version/latest";

export const env = createEnv({
  server: {},
  client: {
    NEXT_PUBLIC_SUBGRAPH_URL: z.url().default(DEFAULT_SUBGRAPH_URL),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SUBGRAPH_URL: process.env.NEXT_PUBLIC_SUBGRAPH_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  emptyStringAsUndefined: true,
});
