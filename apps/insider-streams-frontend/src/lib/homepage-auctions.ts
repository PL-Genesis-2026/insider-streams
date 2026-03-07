import type { AuctionCardData } from "@/components/auction-card";
import { graphqlClient } from "@/lib/graphql";
import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { formatUnits } from "viem";
import { getSecretsByAuctionIds, type EventData } from "@/lib/supabase/secrets";
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

  const allAuctionIds = [
    ...openAuctions.map((auction) => String(auction.auctionId)),
    ...closedAuctions.map((auction) => String(auction.auctionId)),
  ];

  const [latestOpenBids, closedAuctionReferences, secretRows] =
    await Promise.all([
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
      getSecretsByAuctionIds(allAuctionIds),
    ]);

  const latestBidByAuctionId = new Map(latestOpenBids);
  const closedAuctionReferenceById = new Map(
    closedAuctionReferences.map((auction) => [
      String(auction.auctionId),
      auction,
    ]),
  );
  const secretByAuctionId = new Map(
    secretRows.map((row) => [row.auction_id, row]),
  );

  const open = openAuctions.map((a): AuctionCardData => {
    const latestBid = latestBidByAuctionId.get(String(a.auctionId));
    const eventData: EventData | null | undefined = secretByAuctionId.get(
      String(a.auctionId),
    )?.event_data;

    return {
      auctionId: String(a.auctionId),
      sellerAddress: String(a.sellerId),
      marketId: String(a.eventId),
      status: "Open",
      currentBidUsdc: latestBid
        ? Number(
            formatUnits(
              BigInt(String(latestBid.bidAmount)),
              CONFIDENTIAL_USDC_DECIMALS,
            ),
          )
        : undefined,
      endTime: new Date(Number(String(a.endTime)) * 1000).toISOString(),
      marketplace: eventData?.marketplace,
      title: eventData?.event,
      outcome: eventData?.outcome,
    };
  });

  const closed = closedAuctions.map((a): AuctionCardData => {
    const reference = closedAuctionReferenceById.get(String(a.auctionId));
    const eventData: EventData | null | undefined = secretByAuctionId.get(
      String(a.auctionId),
    )?.event_data;

    return {
      auctionId: String(a.auctionId),
      sellerAddress: String(a.sellerId),
      marketId: String(a.eventId),
      status: "Closed",
      currentBidUsdc: Number(
        formatUnits(BigInt(String(a.winningBid)), CONFIDENTIAL_USDC_DECIMALS),
      ),
      endTime: reference
        ? new Date(Number(String(reference.endTime)) * 1000).toISOString()
        : undefined,
      marketplace: eventData?.marketplace,
      title: eventData?.event,
      outcome: eventData?.outcome,
    };
  });

  return { open, closed };
}
