import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPrivateDataRequest } from "@/lib/signed-request";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { PrivateBidRecord, PrivateBidStatus } from "@/lib/private-data/types";

const MAX_AUCTION_IDS = 100;
const auctionIdsSchema = z.array(z.string().min(1)).min(1).max(MAX_AUCTION_IDS);
const privateBidStatusSchema = z.enum(["active", "outbid", "won", "refunded"]);

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
  const { data, error } = await supabase
    .from("private_bids")
    .select("id, auction_id, amount, status, created_at")
    .eq("bidder_address", userAddress)
    .in("auction_id", auctionIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[private-data/bids] Supabase error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // Results are sorted by created_at DESC, so the first bid per auction is the
  // latest. The private-data contract intentionally returns latest bid by
  // auction, not a full bid history.
  const latestBids: Record<string, PrivateBidRecord> = {};
  for (const bid of data) {
    if (!latestBids[bid.auction_id]) {
      const parsedStatus = privateBidStatusSchema.safeParse(bid.status);

      if (!parsedStatus.success) {
        console.error("[private-data/bids] Unexpected bid status:", bid.status);
        return NextResponse.json(
          { error: "Internal server error", code: "INVALID_BID_STATUS" },
          { status: 500 },
        );
      }

      latestBids[bid.auction_id] = {
        ...bid,
        status: parsedStatus.data as PrivateBidStatus,
      };
    }
  }

  return NextResponse.json({ data: latestBids });
}
