// ── Request types (user-facing — account/timestamp/auth handled by client) ──

export interface PrivateTransferRequest {
  recipient: string;
  token: string;
  amount: string;
  flags?: string[];
}

export interface WithdrawRequest {
  token: string;
  amount: string;
}

export interface ListTransactionsRequest {
  limit?: number;
  cursor?: string;
}

// ── Response types ──

export interface Balance {
  token: string;
  amount: string;
}

export interface GetBalancesResponse {
  balances: Balance[];
}

export interface Transaction {
  id: string;
  type: "deposit" | "withdrawal" | "transfer";
  account?: string;
  sender?: string;
  recipient?: string;
  token: string;
  amount: string;
  tx_hash?: string;
  is_incoming?: boolean;
  is_sender_hidden?: boolean;
}

export interface ListTransactionsResponse {
  transactions: Transaction[];
  has_more: boolean;
  next_cursor?: string;
}

export interface PrivateTransferResponse {
  transaction_id: string;
}

export interface WithdrawResponse {
  id: string;
  account: string;
  token: string;
  amount: string;
  deadline: number;
  ticket: string;
}

export interface ShieldedAddressResponse {
  address: string;
}

// ── Error type ──

export interface ApiError {
  error: string;
  error_details?: string;
  request_id?: string;
}
