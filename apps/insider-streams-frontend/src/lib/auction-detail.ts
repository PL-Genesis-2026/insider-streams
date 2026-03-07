import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { formatUnits } from "viem";
import { graphqlClient } from "@/lib/graphql";
import {
  type EventData,
  getSecretByAuctionId,
  parseSecretData,
  type JsonValue,
} from "@/lib/supabase/secrets";
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

export type AuctionDetailSecretRecord = {
  eventData?: EventData;
  secretData?: JsonValue;
  updatedAt: string;
};

export type AuctionDetailData = {
  auctionId: string;
  sellerAddress: string;
  marketId: string;
  title?: string;
  marketplace?: string;
  outcome?: EventData["outcome"];
  endTime?: string;
  createdAt?: string;
  status: "Open" | "Closed" | "Cancelled";
  currentBidUsdc?: number;
  bids: AuctionDetailBid[];
  closedAuction?: AuctionDetailClose;
  cancelledAuction?: AuctionDetailCancelledAuction;
  reputationUpdates: AuctionDetailReputationUpdate[];
  secretRecord?: AuctionDetailSecretRecord;
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

async function getSecretRecord(
  auctionId: bigint,
): Promise<AuctionDetailSecretRecord | undefined> {
  try {
    const secret = await getSecretByAuctionId(String(auctionId));
    if (!secret) {
      return undefined;
    }

    return {
      eventData: secret.event_data ?? undefined,
      secretData: parseSecretData(secret.secret_data),
      updatedAt: secret.updated_at,
    };
  } catch (error) {
    console.error(
      `Failed to load Supabase secret for auction ${auctionId}`,
      error,
    );
    return undefined;
  }
}

function resolveSellerAddress(
  createdAuction:
    | AuctionDetailSubgraphQuery["createdAuction"][number]
    | undefined,
  closedAuction:
    | AuctionDetailSubgraphQuery["closedAuction"][number]
    | undefined,
  cancelledAuction:
    | AuctionDetailSubgraphQuery["cancelledAuction"][number]
    | undefined,
): string | undefined {
  const raw =
    createdAuction?.sellerId ??
    closedAuction?.sellerId ??
    cancelledAuction?.sellerId;
  return raw !== undefined ? String(raw) : undefined;
}

function resolveMarketId(
  createdAuction:
    | AuctionDetailSubgraphQuery["createdAuction"][number]
    | undefined,
  closedAuction:
    | AuctionDetailSubgraphQuery["closedAuction"][number]
    | undefined,
  cancelledAuction:
    | AuctionDetailSubgraphQuery["cancelledAuction"][number]
    | undefined,
): string | undefined {
  const raw =
    createdAuction?.eventId ??
    closedAuction?.eventId ??
    cancelledAuction?.eventId;
  return raw !== undefined ? String(raw) : undefined;
}

export async function getAuctionDetail({
  auctionId,
  bidLimit,
}: AuctionDetailOptions): Promise<AuctionDetailData | null> {
  const result = await sdk.AuctionDetailSubgraph({
    auctionId,
    bidLimit,
  });

  const createdAuction = result.createdAuction[0];
  const closedAuction = result.closedAuction[0];
  const cancelledAuction = result.cancelledAuction[0];
  const latestBid = result.bids[0];

  if (!createdAuction && !closedAuction && !cancelledAuction) {
    return null;
  }

  const sellerAddress = resolveSellerAddress(
    createdAuction,
    closedAuction,
    cancelledAuction,
  );
  const marketId = resolveMarketId(
    createdAuction,
    closedAuction,
    cancelledAuction,
  );

  if (sellerAddress === undefined || marketId === undefined) {
    return null;
  }

  const secretRecord = await getSecretRecord(scalarToBigInt(auctionId));

  return {
    auctionId,
    sellerAddress,
    marketId,
    title: secretRecord?.eventData?.event,
    marketplace: secretRecord?.eventData?.marketplace,
    outcome: secretRecord?.eventData?.outcome,
    endTime:
      createdAuction?.endTime !== undefined
        ? scalarToIso(createdAuction.endTime)
        : undefined,
    createdAt:
      createdAuction?.blockTimestamp !== undefined
        ? scalarToIso(createdAuction.blockTimestamp)
        : undefined,
    status: cancelledAuction
      ? "Cancelled"
      : closedAuction
        ? "Closed"
        : "Open",
    currentBidUsdc: closedAuction
      ? bigintToUsdc(scalarToBigInt(closedAuction.winningBid))
      : latestBid
        ? bigintToUsdc(scalarToBigInt(latestBid.bidAmount))
        : undefined,
    bids: result.bids.map(mapBid),
    closedAuction: closedAuction ? mapClosedAuction(closedAuction) : undefined,
    cancelledAuction: cancelledAuction
      ? mapCancelledAuction(cancelledAuction)
      : undefined,
    reputationUpdates: result.reputationUpdates.map(mapReputationUpdate),
    secretRecord,
  };
}
