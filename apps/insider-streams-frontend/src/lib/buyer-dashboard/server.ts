import "server-only";

import { z } from "zod";
import { graphqlClient } from "@/lib/graphql";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type {
  PrivateBidRecord,
  PrivateBidStatus,
} from "@/lib/private-data/types";
import type {
  BuyerDashboardAuction,
  BuyerDashboardResponse,
} from "./types";

const privateBidStatusSchema = z.enum(["active", "outbid", "won", "refunded"]);

const buyerDashboardQuery = `
  query BuyerDashboardAuctions($auctionIds: [BigInt!]!) {
    auctions(
      first: 500
      where: { auctionId_in: $auctionIds }
      orderBy: blockTimestamp
      orderDirection: desc
    ) {
      auctionId
      sellerId
      eventId
      eventTitle
      endTime
      currentBid
      bidCount
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

type AuctionQueryResponse = {
  auctions: Array<{
    auctionId: string;
    sellerId: string;
    eventId: string;
    eventTitle: string;
    endTime: string;
    currentBid: string;
    bidCount: number;
    status: string;
    predictionOutcome: number | null;
    seller: {
      reputationScore: string;
      totalAuctionCount: number;
      auctionsWithCorrectPredictionsCount: number;
      auctionsWithWrongPredictionsCount: number;
    };
  }>;
};

function toPrivateBidRecord(record: {
  id: string;
  auction_id: string;
  amount: string;
  status: string;
  created_at: string;
}): PrivateBidRecord {
  const parsedStatus = privateBidStatusSchema.safeParse(record.status);

  if (!parsedStatus.success) {
    throw new Error(`Unexpected bid status: ${record.status}`);
  }

  return {
    id: record.id,
    auction_id: record.auction_id,
    amount: record.amount,
    status: parsedStatus.data as PrivateBidStatus,
    created_at: record.created_at,
  };
}

function scalarToIso(value: string): string {
  return new Date(Number(value) * 1000).toISOString();
}

export async function getBuyerDashboardData(
  userAddress: string,
): Promise<BuyerDashboardResponse> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("private_bids")
    .select("id, auction_id, amount, status, created_at")
    .eq("bidder_address", userAddress)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to read private bids: ${error.message}`);
  }

  const groupedBids = new Map<string, PrivateBidRecord[]>();

  for (const row of data ?? []) {
    const bid = toPrivateBidRecord(row);
    const existing = groupedBids.get(bid.auction_id);
    if (existing) {
      existing.push(bid);
    } else {
      groupedBids.set(bid.auction_id, [bid]);
    }
  }

  const auctionIds = [...groupedBids.keys()];

  if (auctionIds.length === 0) {
    return { auctions: [] };
  }

  const subgraphResponse = await graphqlClient.request<AuctionQueryResponse>(
    buyerDashboardQuery,
    { auctionIds },
  );

  const auctionsById = new Map(
    subgraphResponse.auctions.map((auction) => [String(auction.auctionId), auction]),
  );

  const auctions: BuyerDashboardAuction[] = auctionIds.map((auctionId) => {
    const auction = auctionsById.get(auctionId);

    return {
      auctionId,
      sellerId: auction ? String(auction.sellerId) : null,
      marketId: auction ? String(auction.eventId) : null,
      title: auction?.eventTitle ?? null,
      status: auction ? String(auction.status) : null,
      endTime: auction ? scalarToIso(String(auction.endTime)) : null,
      currentBid: auction ? String(auction.currentBid) : null,
      bidCount: auction?.bidCount ?? null,
      predictionOutcome: auction?.predictionOutcome ?? null,
      sellerReputationScore: auction
        ? Number(auction.seller.reputationScore)
        : null,
      sellerTotalAuctions: auction?.seller.totalAuctionCount ?? null,
      sellerCorrectPredictions:
        auction?.seller.auctionsWithCorrectPredictionsCount ?? null,
      sellerWrongPredictions:
        auction?.seller.auctionsWithWrongPredictionsCount ?? null,
      bids: groupedBids.get(auctionId) ?? [],
    };
  });

  return { auctions };
}
