import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySignedRequest } from "@/lib/signed-request";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const secretsFieldsSchema = z.object({
  auctionId: z.string().min(1, "auctionId is required"),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const verified = await verifySignedRequest(body);
  if (!verified.ok) return verified.response;

  const parsed = secretsFieldsSchema.safeParse(verified.payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues.map((e) => e.message).join("; "),
        code: "VALIDATION_ERROR",
      },
      { status: 400 },
    );
  }

  const { auctionId } = parsed.data;
  const userAddress = verified.payload.userAddress;
  const supabase = getSupabaseServiceClient();

  // 1. Fetch the secret and the seller's address in one query
  const { data: secret, error: secretError } = await supabase
    .from("secrets")
    .select("auction_id, secret_data, event_data, seller_id, sellers(address)")
    .eq("auction_id", auctionId)
    .maybeSingle();

  if (secretError) {
    console.error("[secrets] DB error:", secretError.message);
    return NextResponse.json(
      { error: "Internal server error", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  if (!secret) {
    return NextResponse.json(
      { error: "Secret not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // 2. Check if user is the seller
  const sellerAddress = (
    secret.sellers as unknown as { address: string } | null
  )?.address?.toLowerCase();
  const isSeller = sellerAddress === userAddress;

  // 3. Check if user is the winning bidder
  let isWinner = false;
  if (!isSeller) {
    const { data: winningBid } = await supabase
      .from("private_bids")
      .select("bidder_address")
      .eq("auction_id", auctionId)
      .eq("status", "won")
      .maybeSingle();

    isWinner = winningBid?.bidder_address?.toLowerCase() === userAddress;
  }

  if (!isSeller && !isWinner) {
    return NextResponse.json(
      {
        error: "You are not authorized to view this secret",
        code: "UNAUTHORIZED",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({
    data: {
      secret_data: secret.secret_data,
      event_data: secret.event_data,
    },
  });
}
