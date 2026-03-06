import { MOCK_USDC_DECIMALS } from "@private-streams/common";
import { formatUnits, getAddress } from "viem";
import { graphqlClient } from "@/lib/graphql";
import { getSecretByAuctionId, type JsonValue } from "@/lib/supabase/secrets";
import type { AuctionDetailSubgraphQuery } from "../__generated__/sdk";
import { getSdk } from "../__generated__/sdk";

const sdk = getSdk(graphqlClient);

type BidRecord = AuctionDetailSubgraphQuery["bids"][number];
type ClosedAuctionRecord = AuctionDetailSubgraphQuery["closedAuction"][number];
type ForceClosedAuctionRecord =
  AuctionDetailSubgraphQuery["forceClosedAuction"][number];
type TradeExecutedRecord = AuctionDetailSubgraphQuery["tradeExecuted"][number];
type ReputationUpdatedRecord =
  AuctionDetailSubgraphQuery["reputationUpdates"][number];

export type AuctionDetailBid = {
  bidderAddress: string;
  amountUsdc: number;
  timestamp: string;
  transactionHash: string;
};

export type AuctionDetailClose = {
  buyerAddress: string;
  winningBidUsdc: number;
  timestamp: string;
};

export type AuctionDetailForceClose = {
  refundedBidderAddress: string;
  refundAmountUsdc: number;
  reputationDelta: number;
  timestamp: string;
};

export type AuctionDetailTrade = {
  buyerAddress: string;
  amountUsdc: number;
  timestamp: string;
};

export type AuctionDetailReputationUpdate = {
  delta: number;
  newScore: number;
  timestamp: string;
};

export type AuctionDetailSecretRecord = {
  secretData: JsonValue;
  updatedAt: string;
};

export type AuctionDetailData = {
  auctionId: string;
  sellerAddress: string;
  externalMarketId: string;
  reservePriceUsdc?: number;
  endTime?: string;
  createdAt?: string;
  status: "Open" | "Closed" | "ForceClosed";
  currentBidUsdc?: number;
  currentBidderAddress?: string;
  bids: AuctionDetailBid[];
  closedAuction?: AuctionDetailClose;
  forceClosedAuction?: AuctionDetailForceClose;
  tradeExecuted?: AuctionDetailTrade;
  reputationUpdates: AuctionDetailReputationUpdate[];
  secretRecord?: AuctionDetailSecretRecord;
};

type AuctionDetailOptions = {
  auctionId: string;
  bidLimit: number;
};

function bigintToUsdc(value: bigint) {
  return Number(formatUnits(value, MOCK_USDC_DECIMALS));
}

function scalarToBigInt(value: unknown) {
  return BigInt(String(value));
}

function scalarToIso(value: unknown) {
  return new Date(Number(String(value)) * 1000).toISOString();
}

function mapBid(record: BidRecord): AuctionDetailBid {
  return {
    bidderAddress: getAddress(String(record.bidder)),
    amountUsdc: bigintToUsdc(scalarToBigInt(record.amount)),
    timestamp: scalarToIso(record.blockTimestamp),
    transactionHash: String(record.transactionHash),
  };
}

function mapClosedAuction(record: ClosedAuctionRecord): AuctionDetailClose {
  return {
    buyerAddress: getAddress(String(record.buyer)),
    winningBidUsdc: bigintToUsdc(scalarToBigInt(record.winningBid)),
    timestamp: scalarToIso(record.blockTimestamp),
  };
}

function mapForceClosedAuction(
  record: ForceClosedAuctionRecord,
): AuctionDetailForceClose {
  return {
    refundedBidderAddress: getAddress(String(record.refundedBidder)),
    refundAmountUsdc: bigintToUsdc(scalarToBigInt(record.refundAmount)),
    reputationDelta: record.reputationDelta,
    timestamp: scalarToIso(record.blockTimestamp),
  };
}

function mapTradeExecuted(record: TradeExecutedRecord): AuctionDetailTrade {
  return {
    buyerAddress: getAddress(String(record.buyer)),
    amountUsdc: bigintToUsdc(scalarToBigInt(record.amount)),
    timestamp: scalarToIso(record.blockTimestamp),
  };
}

function mapReputationUpdate(
  record: ReputationUpdatedRecord,
): AuctionDetailReputationUpdate {
  return {
    delta: record.delta,
    newScore: Number(scalarToBigInt(record.newScore)),
    timestamp: scalarToIso(record.blockTimestamp),
  };
}

async function getSecretRecord(
  auctionId: bigint,
): Promise<AuctionDetailSecretRecord | undefined> {
  try {
    const secret = await getSecretByAuctionId(Number(auctionId));
    if (!secret) {
      return undefined;
    }

    return {
      secretData: secret.secret_data,
      updatedAt: secret.updated_at,
    };
  } catch (error) {
    console.error(`Failed to load Supabase secret for auction ${auctionId}`, error);
    return undefined;
  }
}

function resolveSellerAddress(
  createdAuction: AuctionDetailSubgraphQuery["createdAuction"][number] | undefined,
  closedAuction: AuctionDetailSubgraphQuery["closedAuction"][number] | undefined,
  forceClosedAuction: AuctionDetailSubgraphQuery["forceClosedAuction"][number] | undefined,
): string | undefined {
  const raw =
    createdAuction?.seller ?? closedAuction?.seller ?? forceClosedAuction?.seller;
  return raw !== undefined ? getAddress(String(raw)) : undefined;
}

function resolveExternalMarketId(
  createdAuction: AuctionDetailSubgraphQuery["createdAuction"][number] | undefined,
  closedAuction: AuctionDetailSubgraphQuery["closedAuction"][number] | undefined,
  forceClosedAuction: AuctionDetailSubgraphQuery["forceClosedAuction"][number] | undefined,
): string | undefined {
  const raw =
    createdAuction?.externalMarketId ??
    closedAuction?.externalMarketId ??
    forceClosedAuction?.externalMarketId;
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
  const forceClosedAuction = result.forceClosedAuction[0];
  const latestBid = result.bids[0];

  if (!createdAuction && !closedAuction && !forceClosedAuction) {
    return null;
  }

  const sellerAddress = resolveSellerAddress(
    createdAuction,
    closedAuction,
    forceClosedAuction,
  );
  const externalMarketId = resolveExternalMarketId(
    createdAuction,
    closedAuction,
    forceClosedAuction,
  );

  if (sellerAddress === undefined || externalMarketId === undefined) {
    return null;
  }

  const secretRecord = await getSecretRecord(scalarToBigInt(auctionId));

  return {
    auctionId,
    sellerAddress,
    externalMarketId,
    reservePriceUsdc:
      createdAuction?.reservePrice !== undefined
        ? bigintToUsdc(scalarToBigInt(createdAuction.reservePrice))
        : undefined,
    endTime:
      createdAuction?.endTime !== undefined
        ? scalarToIso(createdAuction.endTime)
        : undefined,
    createdAt:
      createdAuction?.blockTimestamp !== undefined
        ? scalarToIso(createdAuction.blockTimestamp)
        : undefined,
    status: forceClosedAuction
      ? "ForceClosed"
      : closedAuction
        ? "Closed"
        : "Open",
    currentBidUsdc: closedAuction
      ? bigintToUsdc(scalarToBigInt(closedAuction.winningBid))
      : latestBid
        ? bigintToUsdc(scalarToBigInt(latestBid.amount))
        : undefined,
    currentBidderAddress: closedAuction
      ? getAddress(String(closedAuction.buyer))
      : latestBid
        ? getAddress(String(latestBid.bidder))
        : undefined,
    bids: result.bids.map(mapBid),
    closedAuction: closedAuction ? mapClosedAuction(closedAuction) : undefined,
    forceClosedAuction: forceClosedAuction
      ? mapForceClosedAuction(forceClosedAuction)
      : undefined,
    tradeExecuted: result.tradeExecuted[0]
      ? mapTradeExecuted(result.tradeExecuted[0])
      : undefined,
    reputationUpdates: result.reputationUpdates.map(mapReputationUpdate),
    secretRecord,
  };
}
