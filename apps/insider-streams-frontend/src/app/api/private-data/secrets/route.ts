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

  // 1. Find user's seller record (if any)
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

  // 2. Find user's winning bids for the requested auctions
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

  // 3. Build set of authorized auction IDs
  const winningBidAuctionIds = new Set(
    winningBids.map((b) => b.auction_id),
  );

  // Collect all authorized auction IDs (seller OR winning bidder)
  const authorizedAuctionIds = new Set<string>();

  // Seller auctions: we need to query secrets by seller_id
  // Winning bid auctions: we need to query secrets by auction_id
  // We'll do two queries if needed and merge results

  const result: Record<string, { secret_data: string; event_data: unknown }> =
    {};

  // 4a. Query secrets for seller's auctions
  if (seller) {
    const { data: sellerSecrets, error: sellerSecretsError } = await supabase
      .from("secrets")
      .select("auction_id, secret_data, event_data")
      .eq("seller_id", seller.id)
      .in("auction_id", auctionIds);

    if (sellerSecretsError) {
      console.error(
        "[private-data/secrets] Supabase seller secrets error:",
        sellerSecretsError,
      );
      return NextResponse.json(
        { error: "Internal server error", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    for (const secret of sellerSecrets) {
      result[secret.auction_id] = {
        secret_data: secret.secret_data,
        event_data: secret.event_data,
      };
      authorizedAuctionIds.add(secret.auction_id);
    }
  }

  // 4b. Query secrets for winning bid auctions (skip ones already found as seller)
  const remainingWinningAuctionIds = [...winningBidAuctionIds].filter(
    (id) => !authorizedAuctionIds.has(id),
  );

  if (remainingWinningAuctionIds.length > 0) {
    const { data: bidSecrets, error: bidSecretsError } = await supabase
      .from("secrets")
      .select("auction_id, secret_data, event_data")
      .in("auction_id", remainingWinningAuctionIds);

    if (bidSecretsError) {
      console.error(
        "[private-data/secrets] Supabase bid secrets error:",
        bidSecretsError,
      );
      return NextResponse.json(
        { error: "Internal server error", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    for (const secret of bidSecrets) {
      result[secret.auction_id] = {
        secret_data: secret.secret_data,
        event_data: secret.event_data,
      };
    }
  }

  return NextResponse.json({ data: result });
}
