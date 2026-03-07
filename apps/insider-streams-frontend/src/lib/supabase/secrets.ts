import { z } from "zod";
import { getSupabaseClient } from "./client";

const jsonSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);

const eventDataSchema = z.object({
  marketplace: z.string(),
  event: z.string(),
  marketId: z.number(),
  outcome: z.enum(["yes", "no"]),
});

const secretRowSchema = z.object({
  auction_id: z.string(),
  secret_data: z.string(),
  event_data: eventDataSchema.nullable(),
  seller_id: z.string(),
  buyer: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type SecretRow = z.infer<typeof secretRowSchema>;
export type EventData = z.infer<typeof eventDataSchema>;

export function parseSecretData(value: string): JsonValue | undefined {
  try {
    return jsonSchema.parse(JSON.parse(value));
  } catch {
    return undefined;
  }
}

export async function listSecrets() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("secrets")
    .select(
      "auction_id, secret_data, event_data, seller_id, buyer, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load secrets from Supabase: ${error.message}`);
  }

  return z.array(secretRowSchema).parse(data ?? []);
}

export async function getSecretByAuctionId(auctionId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("secrets")
    .select(
      "auction_id, secret_data, event_data, seller_id, buyer, created_at, updated_at",
    )
    .eq("auction_id", auctionId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load secret for auction ${auctionId}: ${error.message}`,
    );
  }

  return data ? secretRowSchema.parse(data) : null;
}

export async function getSecretsByAuctionIds(auctionIds: string[]) {
  if (auctionIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("secrets")
    .select(
      "auction_id, secret_data, event_data, seller_id, buyer, created_at, updated_at",
    )
    .in("auction_id", auctionIds);

  if (error) {
    throw new Error(`Failed to load secrets for auctions: ${error.message}`);
  }

  return z.array(secretRowSchema).parse(data ?? []);
}
