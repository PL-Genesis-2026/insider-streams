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

export type PrivateFilecoinCopy = {
  providerId: string;
  dataSetId: string;
  pieceId: string;
  role: "primary" | "secondary";
  retrievalUrl: string;
  isNewDataSet: boolean;
};

export type PrivateFileAttachment = {
  encryptionKey: string;
  encryptionAlgorithm: string | null;
  fileName: string;
  encryptedFileName: string | null;
  contentType: string | null;
  fileMd5: string | null;
  fileSizeBytes: string | null;
  encryptedFileSizeBytes: string | null;
  pieceCid: string | null;
  retrievalUrl: string;
  copies: PrivateFilecoinCopy[];
};

type AccessiblePrivateSecretState = {
  kind: "accessible";
  secret_data: string;
  event_data: EventData | null;
  file: PrivateFileAttachment | null;
};

export type PrivateSecretState =
  | AccessiblePrivateSecretState
  | { kind: "forbidden" }
  | { kind: "not_found" };
