import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/env";

let supabaseClient: SupabaseClient | undefined;

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return supabaseClient;
}
