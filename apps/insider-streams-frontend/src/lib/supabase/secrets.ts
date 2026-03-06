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

const secretRowSchema = z.object({
  id: z.union([z.string(), z.number().int()]),
  auction_id: z.number().int().nullable(),
  secret_data: jsonSchema,
  market_data: jsonSchema,
  seller: z.string(),
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

export async function listSecrets() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("secrets")
    .select(
      "id, auction_id, secret_data, market_data, seller, buyer, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load secrets from Supabase: ${error.message}`);
  }

  return z.array(secretRowSchema).parse(data ?? []);
}

export async function getSecretByAuctionId(auctionId: number) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("secrets")
    .select(
      "id, auction_id, secret_data, market_data, seller, buyer, created_at, updated_at",
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
