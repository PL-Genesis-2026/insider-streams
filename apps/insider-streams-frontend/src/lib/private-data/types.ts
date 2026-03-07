import type { Database } from "@private-streams/common";
import type { EventData } from "@/lib/supabase/secrets";

export type PrivateSellerRecord = Pick<
  Database["public"]["Tables"]["sellers"]["Row"],
  "id" | "address"
>;

export type PrivateBidRecord = Pick<
  Database["public"]["Tables"]["private_bids"]["Row"],
  "id" | "auction_id" | "amount" | "status" | "created_at"
>;

export type PrivateSecretRecord = {
  secret_data: string;
  event_data: EventData | null;
};
