import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@private-streams/common";
import { env } from "@/env";

let supabaseServiceClient: SupabaseClient<Database> | undefined;

export function getSupabaseServiceClient(): SupabaseClient<Database> {
  if (!supabaseServiceClient) {
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
    }

    supabaseServiceClient = createClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return supabaseServiceClient;
}
