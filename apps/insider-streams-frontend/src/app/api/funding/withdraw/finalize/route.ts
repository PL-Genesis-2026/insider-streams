import { NextResponse } from "next/server";
import { z } from "zod";
import { finalizeFundingWithdrawal } from "@/lib/funding/server";
import type { FundingFinalizeWithdrawalResponse } from "@/lib/funding/types";
import { verifySignedRequest } from "@/lib/signed-request";

const finalizeWithdrawFieldsSchema = z.object({
  amount: z
    .string()
    .min(1, "amount is required")
    .refine((value) => {
      try {
        return BigInt(value) > BigInt(0);
      } catch {
        return false;
      }
    }, "amount must be a positive integer string"),
  transactionId: z.string().min(1, "transactionId is required"),
  withdrawalId: z.string().min(1, "withdrawalId is required"),
  ticket: z.string().min(1, "ticket is required"),
  deadline: z.number().int().positive("deadline must be a positive integer"),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const verified = await verifySignedRequest<{
    amount: string;
    transactionId: string;
    withdrawalId: string;
    ticket: string;
    deadline: number;
  }>(body);

  if (!verified.ok) {
    return verified.response;
  }

  const parsed = finalizeWithdrawFieldsSchema.safeParse(verified.payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues.map((issue) => issue.message).join("; "),
        code: "VALIDATION_ERROR",
      },
      { status: 400 },
    );
  }

  try {
    const { transactionId, withdrawalId, ...data } = await finalizeFundingWithdrawal(
      verified.payload.userAddress,
      parsed.data,
    );

    return NextResponse.json<FundingFinalizeWithdrawalResponse>({
      data,
      transactionId,
      withdrawalId,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to finalize withdrawal.";

    const status =
      message.includes("could not be found") ||
      message.includes("does not match")
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
