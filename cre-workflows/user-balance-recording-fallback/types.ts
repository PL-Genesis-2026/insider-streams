import { z } from "zod";

// ┌──────────────────────────────────────────────────────────────────────┐
// │ CRON SCHEDULE — Change this to reduce polling frequency after demo  │
// │ Format: seconds minutes hours day-of-month month day-of-week       │
// │ Current: every 60 seconds                                          │
// │ Production suggestion: "0 */5 * * * *" (every 5 minutes)           │
// └──────────────────────────────────────────────────────────────────────┘
export const CRON_SCHEDULE = "*/60 * * * * *";

// EIP-712 domain for the Private Token API (chainId derived at runtime via getNetwork)
export const EIP712_DOMAIN_BASE = {
  name: "CompliantPrivateTokenDemo",
  version: "0.0.1",
  verifyingContract: "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13" as `0x${string}`,
} as const;

export function getEip712Domain(chainId: number) {
  return { ...EIP712_DOMAIN_BASE, chainId };
}

// EIP-712 types for POST /transactions
export const EIP712_TYPES = {
  "List Transactions": [
    { name: "account", type: "address" },
    { name: "timestamp", type: "uint256" },
    { name: "cursor", type: "string" },
    { name: "limit", type: "uint256" },
  ],
} as const;

// Config schema validated at startup by CRE Runner
// NOTE: z.string().url() is NOT compatible with CRE's QuickJS WASM runtime
// (the URL constructor or internal regex it uses crashes silently).
// Use z.string().startsWith("https://") as a simple alternative.
export const configSchema = z.object({
  platformEoaAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/u, "must be a 0x-prefixed 20-byte hex"),
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/u, "must be a 0x-prefixed 20-byte hex"),
  privateTokenApiUrl: z.string().startsWith("https://"),
  supabaseUrl: z.string().startsWith("https://"),
  transactionLimit: z.string().regex(/^\d+$/, "must be a numeric string"),
  chainSelectorName: z.string(),
  ntfyEnabled: z.boolean().default(true),
  ntfyHost: z.string().startsWith("http").default("http://localhost:8090"),
  ntfyTopic: z.string().default("user-balance-recording-fallback-cre"),
  ntfyUser: z.string().default("vps"),
});

export type Config = z.infer<typeof configSchema>;

// Transaction from the Private Token API POST /transactions response.
// The API returns different shapes per type (deposit, transfer, withdrawal).
// All fields are required (no optionals) because CRE's consensus aggregation
// cannot serialize undefined values. Fields not present for a given tx type
// are normalized to "" (empty string) or false in transactions.ts.
export interface PrivateTokenTransaction {
  id: string;
  type: string;           // "deposit" | "transfer" | "withdrawal"
  account: string;        // present for deposit/withdrawal, "" for transfer
  token: string;
  amount: string;         // wei string
  tx_hash: string;        // present for deposit, "" otherwise
  sender: string;         // present for transfer, "" otherwise
  recipient: string;      // present for transfer, "" otherwise
  is_incoming: boolean;   // present for transfer, false otherwise
  is_sender_hidden: boolean; // present for transfer, false otherwise
  withdraw_status: string; // present for withdrawal, "" otherwise
}

// Response from POST /transactions — all fields required for CRE consensus.
export interface TransactionsResponse {
  transactions: PrivateTokenTransaction[];
  has_more: boolean;
  next_cursor: string;  // "" when no next page
}
