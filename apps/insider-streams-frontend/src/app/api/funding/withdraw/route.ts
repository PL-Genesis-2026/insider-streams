import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requestFundingWithdrawal,
} from "@/lib/funding/server";
import type { FundingWithdrawResponse } from "@/lib/funding/types";
import { verifySignedRequest } from "@/lib/signed-request";

const withdrawFieldsSchema = z.object({
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
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const verified = await verifySignedRequest<{ amount: string }>(body);

  if (!verified.ok) {
    return verified.response;
  }

  const parsed = withdrawFieldsSchema.safeParse(verified.payload);

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
    const { transactionId, ...data } = await requestFundingWithdrawal(
      verified.payload.userAddress,
      parsed.data.amount,
    );

    return NextResponse.json<FundingWithdrawResponse>({
      data,
      transactionId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to submit withdrawal.";

    const status =
      message.includes("exceeds available balance") ||
      message.includes("greater than zero")
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
