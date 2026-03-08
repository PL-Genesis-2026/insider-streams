import { z } from "zod";
import type {
  FundingFinalizeWithdrawalResponse,
  FundingReconcileResponse,
  FundingServerSnapshot,
  FundingWithdrawResponse,
} from "./types";
import type { SignedWalletSession } from "@/lib/wallet/use-signed-wallet-session";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

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

const transferSchema = z.object({
  amount: z.string(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  credited_at: z.string().nullable(),
  id: z.string(),
  raw_data: jsonSchema.nullable(),
  recipient_address: z.string().nullable(),
  sender_address: z.string().nullable(),
  status: z.string(),
  token_address: z.string(),
  transaction_id: z.string(),
  updated_at: z.string(),
  user_address: z.string(),
});

const balanceSchema = z.object({
  available_balance: z.string().nullable(),
  locked_balance: z.string().nullable(),
  pending_withdrawal: z.string().nullable(),
  total_from_won_bids: z.string().nullable(),
  user_address: z.string().nullable(),
});

const fundingServerSnapshotSchema = z.object({
  platformRecipientAddress: z.string().optional(),
  balance: balanceSchema.nullable().optional(),
  transfers: z.array(transferSchema),
});

const fundingSnapshotResponseSchema = z.object({
  data: fundingServerSnapshotSchema,
});

const fundingReconcileResponseSchema = z.object({
  data: fundingServerSnapshotSchema,
  reconciledCount: z.number(),
  scannedCount: z.number(),
});

const fundingWithdrawResponseSchema = z.object({
  data: fundingServerSnapshotSchema,
  transactionId: z.string(),
});

const fundingFinalizeWithdrawalResponseSchema = z.object({
  data: fundingServerSnapshotSchema,
  transactionId: z.string(),
  withdrawalId: z.string(),
});

const apiErrorSchema = z.object({
  error: z.string(),
  error_details: z.string().optional(),
});

async function getErrorMessage(response: Response) {
  const body = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(body);

  if (parsed.success) {
    return parsed.data.error_details
      ? `${parsed.data.error}: ${parsed.data.error_details}`
      : parsed.data.error;
  }

  return `Request failed with status ${response.status}.`;
}

export async function fetchFundingSnapshot(
  session: SignedWalletSession,
): Promise<FundingServerSnapshot> {
  const response = await fetch("/api/funding/snapshot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(session),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  const body = fundingSnapshotResponseSchema.parse(await response.json());
  return body.data;
}

export async function reconcileFunding(
  session: SignedWalletSession,
): Promise<FundingReconcileResponse> {
  const response = await fetch("/api/funding/reconcile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(session),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return fundingReconcileResponseSchema.parse(await response.json());
}

export async function requestFundingWithdrawal(payload: {
  amount: string;
  timestamp: number;
  signature: string;
}): Promise<FundingWithdrawResponse> {
  const response = await fetch("/api/funding/withdraw", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return fundingWithdrawResponseSchema.parse(await response.json());
}

export async function finalizeFundingWithdrawal(payload: {
  amount: string;
  transactionId: string;
  withdrawalId: string;
  ticket: string;
  deadline: number;
  timestamp: number;
  signature: string;
}): Promise<FundingFinalizeWithdrawalResponse> {
  const response = await fetch("/api/funding/withdraw/finalize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return fundingFinalizeWithdrawalResponseSchema.parse(await response.json());
}
