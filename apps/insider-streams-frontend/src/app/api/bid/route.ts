import { NextResponse } from "next/server";
import { z } from "zod";
import { executeBid } from "@private-streams/common";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getPublicClient, getAdminWalletClient } from "@/lib/viem";
import { verifySignedRequest } from "@/lib/signed-request";
import { SECRET_MARKETPLACE_ADDRESS } from "@/lib/contract-addresses";

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
  // #region agent log
  fetch("http://127.0.0.1:7859/ingest/ba8f260b-7c31-4bbf-85d3-412660c8b25b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "25cc9c" },
    body: JSON.stringify({
      sessionId: "25cc9c",
      location: "api/bid/route.ts:46",
      message: "Bid API received",
      data: {
        auctionId: parsed.data.auctionId,
        auctionIdType: typeof parsed.data.auctionId,
        amount: parsed.data.amount,
        bidderAddr: verified.payload.userAddress,
      },
      timestamp: Date.now(),
      hypothesisId: "A",
    }),
  }).catch(() => {});
  // #endregion
  const result = await executeBid(
    {
      supabase: getSupabaseServiceClient(),
      publicClient: getPublicClient(),
      walletClient: getAdminWalletClient(),
      marketplaceAddress: SECRET_MARKETPLACE_ADDRESS,
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

  if (result.warning) console.error("[bid] DB write failed after on-chain success:", result.warning);
  return NextResponse.json({ success: true, bidId: result.bidId, txHash: result.txHash });
}
