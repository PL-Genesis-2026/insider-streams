import type { PrivateBidRecord } from "@/lib/private-data/types";

export type BuyerDashboardAuction = {
  auctionId: string;
  sellerId: string | null;
  marketId: string | null;
  title: string | null;
  status: string | null;
  endTime: string | null;
  currentBid: string | null;
  bidCount: number | null;
  predictionOutcome: number | null;
  sellerReputationScore: number | null;
  sellerTotalAuctions: number | null;
  sellerCorrectPredictions: number | null;
  sellerWrongPredictions: number | null;
  bids: PrivateBidRecord[];
};

export type BuyerDashboardResponse = {
  auctions: BuyerDashboardAuction[];
};
