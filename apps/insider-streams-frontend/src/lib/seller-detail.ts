import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { formatUnits } from "viem";
import { graphqlClient } from "@/lib/graphql";
import type { AuctionCardData } from "@/components/auction-card";
import type { SellerDetailQuery } from "../__generated__/sdk";
import { getSdk } from "../__generated__/sdk";

const sdk = getSdk(graphqlClient);

type SellerAuctionRecord = NonNullable<
  SellerDetailQuery["seller"]
>["auctions"][number];

export type SellerDetailData = {
  sellerId: string;
  reputationScore: number;
  totalAuctionCount: number;
  openAuctionCount: number;
  correctPredictions: number;
  wrongPredictions: number;
  unscorableAuctions: number;
  totalEarningsUsdc: number;
  auctions: AuctionCardData[];
};

function bigintToUsdc(value: bigint) {
  return Number(formatUnits(value, CONFIDENTIAL_USDC_DECIMALS));
}

function scalarToBigInt(value: unknown) {
  return BigInt(String(value));
}

type SellerSummary = {
  sellerId: string;
  reputationScore: number;
  totalAuctionCount: number;
  correctPredictions: number;
  wrongPredictions: number;
};

function mapAuction(
  record: SellerAuctionRecord,
  seller: SellerSummary,
): AuctionCardData {
  const currentBidBigInt = scalarToBigInt(record.currentBid);

  return {
    auctionId: String(record.auctionId),
    sellerAddress: seller.sellerId,
    marketId: String(record.eventId),
    status: String(record.status),
    currentBidUsdc:
      currentBidBigInt > BigInt(0) ? bigintToUsdc(currentBidBigInt) : undefined,
    bidCount: record.bidCount,
    endTime: new Date(Number(String(record.endTime)) * 1000).toISOString(),
    title: record.eventTitle,
    sellerReputationScore: seller.reputationScore,
    sellerTotalAuctions: seller.totalAuctionCount,
    sellerCorrectPredictions: seller.correctPredictions,
    sellerWrongPredictions: seller.wrongPredictions,
  };
}

export async function getSellerDetail(
  sellerId: string,
): Promise<SellerDetailData | null> {
  const result = await sdk.SellerDetail({ sellerId });

  const seller = result.seller;

  if (!seller) {
    return null;
  }

  return {
    sellerId: seller.sellerId,
    reputationScore: Number(scalarToBigInt(seller.reputationScore)),
    totalAuctionCount: seller.totalAuctionCount,
    openAuctionCount: seller.openAuctionCount,
    correctPredictions: seller.auctionsWithCorrectPredictionsCount,
    wrongPredictions: seller.auctionsWithWrongPredictionsCount,
    unscorableAuctions: seller.unscorableAuctionCount,
    totalEarningsUsdc: bigintToUsdc(scalarToBigInt(seller.totalEarnings)),
    auctions: seller.auctions.map((a) =>
      mapAuction(a, {
        sellerId: seller.sellerId,
        reputationScore: Number(scalarToBigInt(seller.reputationScore)),
        totalAuctionCount: seller.totalAuctionCount,
        correctPredictions: seller.auctionsWithCorrectPredictionsCount,
        wrongPredictions: seller.auctionsWithWrongPredictionsCount,
      }),
    ),
  };
}
