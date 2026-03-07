import { NextResponse } from "next/server";
import { z } from "zod";
import { type Address } from "viem";
import { executeBid, SECRET_MARKETPLACE_ADDRESS } from "@private-streams/common";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getPublicClient, getAdminWalletClient } from "@/lib/viem";
import { verifySignedRequest } from "@/lib/signed-request";

const bidFieldsSchema = z.object({
  auctionId: z.string().min(1, "auctionId is required"),
  amount: z
    .string()
    .min(1, "amount is required")
    .refine((v) => {
      try {
        return BigInt(v) > BigInt(0);
      } catch {
        return false;
      }
    }, "amount must be a positive integer string"),
});

export async function POST(request: Request) {
  // 1. Parse + verify signature
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const verified = await verifySignedRequest(body);
  if (!verified.ok) return verified.response;

  // 2. Validate bid-specific fields
  const parsed = bidFieldsSchema.safeParse(verified.payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues.map((e: { message: string }) => e.message).join("; "),
        code: "VALIDATION_ERROR",
      },
      { status: 400 },
    );
  }

  // 3. Execute bid via shared core logic
  const result = await executeBid(
    {
      supabase: getSupabaseServiceClient(),
      publicClient: getPublicClient(),
      walletClient: getAdminWalletClient(),
      marketplaceAddress: SECRET_MARKETPLACE_ADDRESS as Address,
    },
    {
      bidderAddr: verified.payload.userAddress,
      auctionId: parsed.data.auctionId,
      amount: parsed.data.amount,
    },
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({ success: true, bidId: result.bidId, txHash: result.txHash });
}
