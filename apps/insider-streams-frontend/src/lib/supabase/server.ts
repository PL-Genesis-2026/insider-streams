import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@private-streams/common";

let supabaseServiceClient: SupabaseClient<Database> | undefined;

export function getSupabaseServiceClient(): SupabaseClient<Database> {
  if (!supabaseServiceClient) {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) {
      throw new Error("Missing SUPABASE_URL environment variable");
    }
    if (!serviceRoleKey) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
    }

    supabaseServiceClient = createClient<Database>(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseServiceClient;
}
