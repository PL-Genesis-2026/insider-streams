import type { Database } from "@private-streams/common";
import type { EventData } from "@/lib/supabase/secrets";

export type PrivateSellerRecord = Pick<
  Database["public"]["Tables"]["sellers"]["Row"],
  "id" | "address"
>;

export type PrivateBidStatus = "active" | "outbid" | "won" | "refunded";

type PrivateBidBaseRecord = Pick<
  Database["public"]["Tables"]["private_bids"]["Row"],
  "id" | "auction_id" | "amount" | "status" | "created_at"
>;

export type PrivateBidRecord = Omit<PrivateBidBaseRecord, "status"> & {
  status: PrivateBidStatus;
};

type AccessiblePrivateSecretState = {
  kind: "accessible";
  secret_data: string;
  event_data: EventData | null;
};

export type PrivateSecretState =
  | AccessiblePrivateSecretState
  | { kind: "forbidden" }
  | { kind: "not_found" };
