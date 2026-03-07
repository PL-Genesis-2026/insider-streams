import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const DEFAULT_SUBGRAPH_URL =
  "https://api.studio.thegraph.com/query/1743303/insider-streams/version/latest";

export const env = createEnv({
  server: {
    RPC_URL: z.url().default("https://ethereum-sepolia-rpc.publicnode.com"),
    OWNER_PK: z.string().startsWith("0x").min(66).max(66),
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_SUBGRAPH_URL: z.url().default(DEFAULT_SUBGRAPH_URL),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
  runtimeEnv: {
    RPC_URL: process.env.RPC_URL,
    OWNER_PK: process.env.OWNER_PK,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUBGRAPH_URL: process.env.NEXT_PUBLIC_SUBGRAPH_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  emptyStringAsUndefined: true,
});
