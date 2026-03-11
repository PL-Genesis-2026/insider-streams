import { z } from "zod";
import type {
  FundingDepositResponse,
  FundingServerSnapshot,
  FundingWithdrawResponse,
} from "./types";
import type { SignedWalletSession } from "@/lib/wallet/use-signed-wallet-session";

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

  const body = await response.json();
  return {
    userId: body.userId ?? null,
    balance: body.balance ?? "0",
  };
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

  return response.json();
}

export async function requestFundingDeposit(payload: {
  amount: string;
  timestamp: number;
  signature: string;
}): Promise<FundingDepositResponse> {
  const response = await fetch("/api/funding/deposit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.json();
}
