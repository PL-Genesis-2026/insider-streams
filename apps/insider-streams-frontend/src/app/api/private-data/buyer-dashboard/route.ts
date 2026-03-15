import { NextResponse } from "next/server";
import { proxyToDaemon } from "@/lib/daemon-client";
import { subgraphClient } from "@/lib/subgraph-client";
import type { BuyerDashboardAuction, BuyerDashboardResponse } from "@/lib/buyer-dashboard/types";
import type { PrivateBidRecord, PrivateBidStatus } from "@/lib/private-data/types";

export const maxDuration = 60;

type DaemonBid = {
  auctionId: number;
  amount: string;
  status: string;
  txHash: string | null;
  createdAt: string;
};

type SubgraphAuction = {
  auctionId: string;
  sellerId: string;
  eventId: string;
  eventTitle: string;
  endTime: string;
  bidCount: number;
  currentBid: string;
  status: string;
  predictionOutcome: number | null;
  seller: {
    reputationScore: string;
    totalAuctionCount: number;
    auctionsWithCorrectPredictionsCount: number;
    auctionsWithWrongPredictionsCount: number;
  };
};

async function fetchAuctionMetadata(
  auctionIds: string[],
): Promise<Map<string, SubgraphAuction>> {
  if (auctionIds.length === 0) return new Map();

  const query = `
    query BuyerDashboardAuctions($ids: [BigInt!]!) {
      auctions(where: { auctionId_in: $ids }, first: 1000) {
        auctionId
        sellerId
        eventId
        eventTitle
        endTime
        bidCount
        currentBid
        status
        predictionOutcome
        seller {
          reputationScore
          totalAuctionCount
          auctionsWithCorrectPredictionsCount
          auctionsWithWrongPredictionsCount
        }
      }
    }
  `;

  const data = await subgraphClient.request<{ auctions: SubgraphAuction[] }>(
    query,
    { ids: auctionIds },
  );

  const map = new Map<string, SubgraphAuction>();
  for (const auction of data.auctions) {
    map.set(auction.auctionId, auction);
  }
  return map;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const res = await proxyToDaemon("/dashboard", body);
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    const bids: DaemonBid[] = data.bids ?? [];

    // Group bids by auctionId
    const bidsByAuction = new Map<string, PrivateBidRecord[]>();
    for (const bid of bids) {
      const key = String(bid.auctionId);
      const records = bidsByAuction.get(key) ?? [];
      records.push({
        id: `${bid.auctionId}-${bid.createdAt}`,
        auction_id: key,
        amount: bid.amount,
        status: bid.status as PrivateBidStatus,
        created_at: bid.createdAt,
      });
      bidsByAuction.set(key, records);
    }

    // Fetch auction metadata from subgraph
    const auctionIds = Array.from(bidsByAuction.keys());
    let metadataMap: Map<string, SubgraphAuction>;
    try {
      metadataMap = await fetchAuctionMetadata(auctionIds);
    } catch (err) {
      console.error("[api/buyer-dashboard] subgraph query failed:", err);
      metadataMap = new Map();
    }

    // Merge bids with auction metadata
    const auctions: BuyerDashboardAuction[] = auctionIds.map((auctionId) => {
      const meta = metadataMap.get(auctionId);
      const auctionBids = bidsByAuction.get(auctionId) ?? [];

      return {
        auctionId,
        sellerId: meta?.sellerId ?? null,
        marketId: meta?.eventId ?? null,
        title: meta?.eventTitle ?? null,
        status: meta?.status ?? null,
        endTime: meta?.endTime ? new Date(Number(meta.endTime) * 1000).toISOString() : null,
        currentBid: meta?.currentBid ?? null,
        bidCount: meta?.bidCount ?? null,
        predictionOutcome: meta?.predictionOutcome ?? null,
        sellerReputationScore: meta?.seller ? Number(meta.seller.reputationScore) : null,
        sellerTotalAuctions: meta?.seller?.totalAuctionCount ?? null,
        sellerCorrectPredictions: meta?.seller?.auctionsWithCorrectPredictionsCount ?? null,
        sellerWrongPredictions: meta?.seller?.auctionsWithWrongPredictionsCount ?? null,
        bids: auctionBids,
      };
    });

    const response: BuyerDashboardResponse = { auctions };
    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/buyer-dashboard] proxy error:", msg);
    return NextResponse.json({ error: `Daemon unreachable: ${msg}` }, { status: 502 });
  }
}
