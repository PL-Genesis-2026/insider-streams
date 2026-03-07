import { z } from "zod";
import type { Database } from "@private-streams/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

type SecretsRow = Database["public"]["Tables"]["secrets"]["Row"];

const eventDataSchema = z.object({
  marketplace: z.string(),
  event: z.string(),
  marketId: z.number(),
  outcome: z.enum(["yes", "no"]),
});

export type EventData = z.infer<typeof eventDataSchema>;

export type SecretRow = Omit<SecretsRow, "event_data"> & {
  event_data: EventData | null;
};

const FULL_COLUMNS =
  "auction_id, secret_data, event_data, seller_id, buyer, created_at, updated_at" as const;

function parseEventData(raw: unknown): EventData | null {
  const result = eventDataSchema.safeParse(raw);
  return result.success ? result.data : null;
}

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
    .select(FULL_COLUMNS)
    .eq("auction_id", auctionId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load secret for auction ${auctionId}: ${error.message}`,
    );
  }

  if (!data) return null;

  return {
    ...data,
    event_data: parseEventData(data.event_data),
  } as SecretRow;
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
    .select(FULL_COLUMNS)
    .in("auction_id", auctionIds);

  if (error) {
    throw new Error(`Failed to load secrets for auctions: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    ...row,
    event_data: parseEventData(row.event_data),
  })) as SecretRow[];
}

