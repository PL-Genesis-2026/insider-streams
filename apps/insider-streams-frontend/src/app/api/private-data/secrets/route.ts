import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPrivateDataRequest } from "@/lib/signed-request";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const auctionIdsSchema = z.array(z.string().min(1)).min(1).max(100);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const verified = await verifyPrivateDataRequest<{
    auctionIds: string[];
  }>(body, ["auctionIds"]);
  if (!verified.ok) return verified.response;

  const { userAddress } = verified.payload;

  // Validate auctionIds
  const parsed = auctionIdsSchema.safeParse(verified.payload.auctionIds);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues
          .map((e: { message: string }) => e.message)
          .join("; "),
        code: "VALIDATION_ERROR",
      },
      { status: 400 },
    );
  }
  const auctionIds = parsed.data;

  const supabase = getSupabaseServiceClient();

  const { data: seller, error: sellerError } = await supabase
    .from("sellers")
    .select("id")
    .eq("address", userAddress)
    .maybeSingle();

  if (sellerError) {
    console.error("[private-data/secrets] Supabase seller error:", sellerError);
    return NextResponse.json(
      { error: "Internal server error", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const { data: winningBids, error: bidsError } = await supabase
    .from("private_bids")
    .select("auction_id")
    .eq("bidder_address", userAddress)
    .eq("status", "won")
    .in("auction_id", auctionIds);

  if (bidsError) {
    console.error("[private-data/secrets] Supabase bids error:", bidsError);
    return NextResponse.json(
      { error: "Internal server error", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const { data: secrets, error: secretsError } = await supabase
    .from("secrets")
    .select("auction_id, seller_id, secret_data, event_data")
    .in("auction_id", auctionIds);

  if (secretsError) {
    console.error(
      "[private-data/secrets] Supabase secrets error:",
      secretsError,
    );
    return NextResponse.json(
      { error: "Internal server error", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const winningBidAuctionIds = new Set(
    winningBids.map((bid) => bid.auction_id),
  );
  const secretsByAuctionId = new Map(
    secrets.map((secret) => [secret.auction_id, secret]),
  );

  const result = Object.fromEntries(
    auctionIds.map((auctionId) => {
      const secret = secretsByAuctionId.get(auctionId);

      if (!secret) {
        return [auctionId, { kind: "not_found" as const }];
      }

      const canAccessSecret =
        secret.seller_id === seller?.id || winningBidAuctionIds.has(auctionId);

      if (!canAccessSecret) {
        return [auctionId, { kind: "forbidden" as const }];
      }

      return [
        auctionId,
        {
          kind: "accessible" as const,
          secret_data: secret.secret_data,
          event_data: secret.event_data,
        },
      ];
    }),
  );

  return NextResponse.json({ data: result });
}
