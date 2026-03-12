import { NextResponse } from "next/server";
import { proxyToDaemon } from "@/lib/daemon-client";
import type { PrivateBidRecord } from "@/lib/private-data/types";

type DaemonBid = {
  id: number;
  auction_id: number;
  amount: string;
  status: string;
  created_at: string;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const res = await proxyToDaemon("/bids", body);
  const json = await res.json();

  if (!res.ok) {
    return NextResponse.json(json, { status: res.status });
  }

  // Transform daemon's flat array into Record<auctionId, PrivateBidRecord>
  // (keyed by auction_id, latest bid per auction) matching the original format.
  const bids: DaemonBid[] = json.bids ?? [];
  const data: Record<string, PrivateBidRecord> = {};

  for (const bid of bids) {
    const key = String(bid.auction_id);
    // Keep latest bid per auction (daemon returns sorted by created_at desc)
    if (!data[key]) {
      data[key] = {
        id: String(bid.id),
        auction_id: key,
        amount: bid.amount,
        status: bid.status as PrivateBidRecord["status"],
        created_at: bid.created_at,
      };
    }
  }

  return NextResponse.json({ data }, { status: 200 });
}
