import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { formatUnits } from "viem";
import { graphqlClient } from "@/lib/graphql";
import { getSecretByAuctionId } from "@/lib/supabase/secrets";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { AuctionDetailSubgraphQuery } from "../__generated__/sdk";
import { getSdk } from "../__generated__/sdk";

const sdk = getSdk(graphqlClient);

type BidRecord = AuctionDetailSubgraphQuery["bids"][number];
type ClosedAuctionRecord = AuctionDetailSubgraphQuery["closedAuction"][number];
type CancelledAuctionRecord =
  AuctionDetailSubgraphQuery["cancelledAuction"][number];
type ReputationUpdatedRecord =
  AuctionDetailSubgraphQuery["reputationUpdates"][number];

export type AuctionDetailBid = {
  amountUsdc: number;
  previousBidUsdc: number;
  timestamp: string;
  transactionHash: string;
};

export type AuctionDetailClose = {
  winningBidUsdc: number;
  timestamp: string;
};

export type AuctionDetailCancelledAuction = {
  refundedAmountUsdc: number;
  timestamp: string;
};

export type AuctionDetailReputationUpdate = {
  predictionOutcome: number;
  scoreChange: number;
  newScore: number;
  timestamp: string;
};

export type AuctionDetailData = {
  auctionId: string;
  sellerAddress: string;
  marketId: string;
  title?: string;
  marketplace?: string;
  outcome?: "yes" | "no";
  endTime?: string;
  createdAt?: string;
  status: "Open" | "Closed" | "Cancelled";
  currentBidUsdc?: number;
  bidCount: number;
  bids: AuctionDetailBid[];
  closedAuction?: AuctionDetailClose;
  cancelledAuction?: AuctionDetailCancelledAuction;
  reputationUpdates: AuctionDetailReputationUpdate[];
  hasSecret: boolean;
  secretUpdatedAt?: string;
  sellerReputationScore?: number;
  sellerTotalAuctions?: number;
  sellerCorrectPredictions?: number;
  sellerWrongPredictions?: number;
  sellerTotalEarnings?: number;
};

type AuctionDetailOptions = {
  auctionId: string;
  bidLimit: number;
};

function bigintToUsdc(value: bigint) {
  return Number(formatUnits(value, CONFIDENTIAL_USDC_DECIMALS));
}

function scalarToBigInt(value: unknown) {
  return BigInt(String(value));
}

function scalarToIso(value: unknown) {
  return new Date(Number(String(value)) * 1000).toISOString();
}

function mapBid(record: BidRecord): AuctionDetailBid {
  return {
    amountUsdc: bigintToUsdc(scalarToBigInt(record.bidAmount)),
    previousBidUsdc: bigintToUsdc(scalarToBigInt(record.previousBid)),
    timestamp: scalarToIso(record.blockTimestamp),
    transactionHash: String(record.transactionHash),
  };
}

function mapClosedAuction(record: ClosedAuctionRecord): AuctionDetailClose {
  return {
    winningBidUsdc: bigintToUsdc(scalarToBigInt(record.winningBid)),
    timestamp: scalarToIso(record.blockTimestamp),
  };
}

function mapCancelledAuction(
  record: CancelledAuctionRecord,
): AuctionDetailCancelledAuction {
  return {
    refundedAmountUsdc: bigintToUsdc(scalarToBigInt(record.cancelledBidAmount)),
    timestamp: scalarToIso(record.blockTimestamp),
  };
}

function mapReputationUpdate(
  record: ReputationUpdatedRecord,
): AuctionDetailReputationUpdate {
  return {
    predictionOutcome: record.predictionOutcome,
    scoreChange: record.scoreChange,
    newScore: Number(scalarToBigInt(record.newScore)),
    timestamp: scalarToIso(record.blockTimestamp),
  };
}

export async function getAuctionDetail({
  auctionId,
  bidLimit,
}: AuctionDetailOptions): Promise<AuctionDetailData | null> {
  const result = await sdk.AuctionDetailSubgraph({
    auctionId,
    auctionIdBigInt: auctionId,
    bidLimit,
  });

  const auction = result.auction;

  if (!auction) {
    return null;
  }

  const closedAuction = result.closedAuction[0];
  const cancelledAuction = result.cancelledAuction[0];

  const currentBidBigInt = scalarToBigInt(auction.currentBid);

  // Fetch secret server-side to extract public metadata (title, marketplace, outcome).
  // The secret_data itself is NOT passed to the client — it is fetched on demand
  // via /api/secrets after user interaction.
  let secret;
  try {
    const client = getSupabaseServiceClient();
    secret = await getSecretByAuctionId(auctionId, client);
  } catch (error) {
    console.error(
      `Failed to load Supabase secret for auction ${auctionId}`,
      error,
    );
  }

  return {
    auctionId,
    sellerAddress: String(auction.sellerId),
    marketId: String(auction.eventId),
    title: secret?.event_data?.event ?? auction.eventTitle,
    marketplace: secret?.event_data?.marketplace,
    outcome: secret?.event_data?.outcome,
    endTime: scalarToIso(auction.endTime),
    createdAt: scalarToIso(auction.blockTimestamp),
    status: auction.status as "Open" | "Closed" | "Cancelled",
    currentBidUsdc:
      currentBidBigInt > BigInt(0)
        ? bigintToUsdc(currentBidBigInt)
        : undefined,
    bidCount: auction.bidCount,
    bids: result.bids.map(mapBid),
    closedAuction: closedAuction ? mapClosedAuction(closedAuction) : undefined,
    cancelledAuction: cancelledAuction
      ? mapCancelledAuction(cancelledAuction)
      : undefined,
    reputationUpdates: result.reputationUpdates.map(mapReputationUpdate),
    hasSecret: secret != null,
    secretUpdatedAt: secret?.updated_at,
    sellerReputationScore: Number(auction.seller.reputationScore),
    sellerTotalAuctions: auction.seller.totalAuctionCount,
    sellerCorrectPredictions:
      auction.seller.auctionsWithCorrectPredictionsCount,
    sellerWrongPredictions:
      auction.seller.auctionsWithWrongPredictionsCount,
    sellerTotalEarnings: bigintToUsdc(
      scalarToBigInt(auction.seller.totalEarnings),
    ),
  };
}
