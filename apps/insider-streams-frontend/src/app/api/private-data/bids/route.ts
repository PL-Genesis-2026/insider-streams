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

  // For each auction, keep only the latest bid (first one since ordered DESC)
  const latestBids: Record<
    string,
    {
      id: string;
      auction_id: string;
      amount: string;
      status: string;
      created_at: string;
    }
  > = {};
  for (const bid of data) {
    if (!latestBids[bid.auction_id]) {
      latestBids[bid.auction_id] = bid;
    }
  }

  return NextResponse.json({ data: latestBids });
}
