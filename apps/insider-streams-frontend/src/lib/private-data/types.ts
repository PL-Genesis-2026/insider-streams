export type PrivateSellerRecord = {
  id: string;
  address: string;
};

export type PrivateBidStatus = "active" | "outbid" | "won" | "refunded";

export type PrivateBidRecord = {
  id: string;
  auction_id: string;
  amount: string;
  status: PrivateBidStatus;
  created_at: string;
};

export type EventData = {
  marketplace: string;
  event: string;
  marketId: number;
  outcome: "yes" | "no";
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
