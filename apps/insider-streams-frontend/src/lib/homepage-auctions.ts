import { MOCK_USDC_DECIMALS } from "@private-streams/common";
import { formatUnits, getAddress } from "viem";
import type { AuctionCardData } from "@/components/auction-card";
import { graphqlClient } from "@/lib/graphql";
import { getSdk } from "../__generated__/sdk";

const sdk = getSdk(graphqlClient);

export type HomepageAuctions = {
  open: AuctionCardData[];
  closed: AuctionCardData[];
};

type HomepageAuctionListOptions = {
  openLimit: number;
  closedLimit: number;
};

export async function getHomepageAuctions({
  openLimit,
  closedLimit,
}: HomepageAuctionListOptions): Promise<HomepageAuctions> {
  const now = Math.floor(Date.now() / 1000).toString();
  const { openAuctions, closedAuctions } = await sdk.HomepageAuctionLists({
    currentTimestamp: now,
    openLimit,
    closedLimit,
  });

  if (openAuctions.length === 0 && closedAuctions.length === 0) {
    return { open: [], closed: [] };
  }

  const [latestOpenBids, closedAuctionReferences] = await Promise.all([
    Promise.all(
      openAuctions.map(async (auction) => {
        const { bidPlaceds } = await sdk.HomepageLatestBid({
          auctionId: auction.auctionId,
        });

        return [String(auction.auctionId), bidPlaceds[0]] as const;
      }),
    ),
    closedAuctions.length === 0
      ? Promise.resolve([])
      : sdk
          .HomepageClosedAuctionReferences({
            auctionIds: closedAuctions.map((auction) => auction.auctionId),
          })
          .then((result) => result.referenceAuctions),
  ]);

  const latestBidByAuctionId = new Map(latestOpenBids);
  const closedAuctionReferenceById = new Map(
    closedAuctionReferences.map((auction) => [String(auction.auctionId), auction]),
  );

  const open = openAuctions.map((a): AuctionCardData => {
    const latestBid = latestBidByAuctionId.get(String(a.auctionId));

    return {
      auctionId: String(a.auctionId),
      sellerAddress: getAddress(String(a.seller)),
      externalMarketId: String(a.externalMarketId),
      status: "Open",
      currentBidUsdc: latestBid
        ? Number(
            formatUnits(BigInt(String(latestBid.amount)), MOCK_USDC_DECIMALS),
          )
        : undefined,
      reserveUsdc: Number(
        formatUnits(BigInt(String(a.reservePrice)), MOCK_USDC_DECIMALS),
      ),
      endTime: new Date(Number(String(a.endTime)) * 1000).toISOString(),
    };
  });

  const closed = closedAuctions.map((a): AuctionCardData => {
    const reference = closedAuctionReferenceById.get(String(a.auctionId));

    return {
      auctionId: String(a.auctionId),
      sellerAddress: getAddress(String(a.seller)),
      externalMarketId: String(a.externalMarketId),
      status: "Closed",
      currentBidUsdc: Number(
        formatUnits(BigInt(String(a.winningBid)), MOCK_USDC_DECIMALS),
      ),
      reserveUsdc: reference
        ? Number(
            formatUnits(
              BigInt(String(reference.reservePrice)),
              MOCK_USDC_DECIMALS,
            ),
          )
        : undefined,
      endTime: reference
        ? new Date(Number(String(reference.endTime)) * 1000).toISOString()
        : undefined,
    };
  });

  return { open, closed };
}
