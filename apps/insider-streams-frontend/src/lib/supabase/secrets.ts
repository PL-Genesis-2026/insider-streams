import type { Database } from "@private-streams/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

type SecretsRow = Database["public"]["Tables"]["secrets"]["Row"];

export type EventData = {
  marketplace: string;
  event: string;
  marketId: number;
  outcome: "yes" | "no";
};

export type SecretRow = Omit<SecretsRow, "event_data"> & {
  event_data: EventData | null;
};

const SECRET_COLUMNS =
  "auction_id, secret_data, event_data, seller_id, buyer, created_at, updated_at" as const;

/**
 * Default Supabase client (anon key). Server-side callers that need to bypass
 * RLS can pass in the service-role client instead.
 */
function defaultClient(): SupabaseClient<Database> {
  return getSupabaseClient();
}

export async function getSecretByAuctionId(
  auctionId: string,
  client: SupabaseClient<Database> = defaultClient(),
): Promise<SecretRow | null> {
  const { data, error } = await client
    .from("secrets")
    .select(SECRET_COLUMNS)
    .eq("auction_id", auctionId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load secret for auction ${auctionId}: ${error.message}`,
    );
  }

  return (data as SecretRow) ?? null;
}

export async function getSecretsByAuctionIds(
  auctionIds: string[],
  client: SupabaseClient<Database> = defaultClient(),
): Promise<SecretRow[]> {
  if (auctionIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("secrets")
    .select(SECRET_COLUMNS)
    .in("auction_id", auctionIds);

  if (error) {
    throw new Error(`Failed to load secrets for auctions: ${error.message}`);
  }

  return (data ?? []) as SecretRow[];
}
