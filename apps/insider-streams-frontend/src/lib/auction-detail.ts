import { graphqlClient } from "@/lib/graphql";
import { getSecretByAuctionId, type JsonValue } from "@/lib/supabase/secrets";
import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { formatUnits } from "viem";
import type { AuctionDetailSubgraphQuery } from "../__generated__/sdk";
import { getSdk } from "../__generated__/sdk";

const sdk = getSdk(graphqlClient);

type BidRecord = AuctionDetailSubgraphQuery["bids"][number];
type ClosedAuctionRecord = AuctionDetailSubgraphQuery["closedAuction"][number];
type ForceClosedAuctionRecord =
  AuctionDetailSubgraphQuery["forceClosedAuction"][number];
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

export type AuctionDetailForceClose = {
  heldAmountUsdc: number;
  reputationDelta: number;
  timestamp: string;
};

export type AuctionDetailReputationUpdate = {
  reputationDelta: number;
  newScore: number;
  timestamp: string;
};

export type AuctionDetailSecretRecord = {
  secretData: JsonValue;
  updatedAt: string;
};

export type AuctionDetailData = {
  auctionId: string;
  sellerId: string;
  eventId: string;
  eventTitle?: string;
  endTime?: string;
  createdAt?: string;
  status: "Open" | "Closed" | "ForceClosed";
  currentBidUsdc?: number;
  bids: AuctionDetailBid[];
  closedAuction?: AuctionDetailClose;
  forceClosedAuction?: AuctionDetailForceClose;
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

function mapForceClosedAuction(
  record: ForceClosedAuctionRecord,
): AuctionDetailForceClose {
  return {
    heldAmountUsdc: bigintToUsdc(scalarToBigInt(record.heldAmount)),
    reputationDelta: record.reputationDelta,
    timestamp: scalarToIso(record.blockTimestamp),
  };
}

function mapReputationUpdate(
  record: ReputationUpdatedRecord,
): AuctionDetailReputationUpdate {
  return {
    reputationDelta: record.reputationDelta,
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
    console.error(
      `Failed to load Supabase secret for auction ${auctionId}`,
      error,
    );
    return undefined;
  }
}

function resolveSellerId(
  createdAuction:
    | AuctionDetailSubgraphQuery["createdAuction"][number]
    | undefined,
  closedAuction:
    | AuctionDetailSubgraphQuery["closedAuction"][number]
    | undefined,
  forceClosedAuction:
    | AuctionDetailSubgraphQuery["forceClosedAuction"][number]
    | undefined,
): string | undefined {
  const raw =
    createdAuction?.sellerId ??
    closedAuction?.sellerId ??
    forceClosedAuction?.sellerId;
  return raw !== undefined ? String(raw) : undefined;
}

function resolveEventId(
  createdAuction:
    | AuctionDetailSubgraphQuery["createdAuction"][number]
    | undefined,
  closedAuction:
    | AuctionDetailSubgraphQuery["closedAuction"][number]
    | undefined,
  forceClosedAuction:
    | AuctionDetailSubgraphQuery["forceClosedAuction"][number]
    | undefined,
): string | undefined {
  const raw =
    createdAuction?.eventId ??
    closedAuction?.eventId ??
    forceClosedAuction?.eventId;
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

  const sellerId = resolveSellerId(
    createdAuction,
    closedAuction,
    forceClosedAuction,
  );
  const eventId = resolveEventId(
    createdAuction,
    closedAuction,
    forceClosedAuction,
  );

  if (sellerId === undefined || eventId === undefined) {
    return null;
  }

  const secretRecord = await getSecretRecord(scalarToBigInt(auctionId));

  return {
    auctionId,
    sellerId,
    eventId,
    eventTitle: createdAuction?.eventTitle
      ? String(createdAuction.eventTitle)
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
        ? bigintToUsdc(scalarToBigInt(latestBid.bidAmount))
        : undefined,
    bids: result.bids.map(mapBid),
    closedAuction: closedAuction ? mapClosedAuction(closedAuction) : undefined,
    forceClosedAuction: forceClosedAuction
      ? mapForceClosedAuction(forceClosedAuction)
      : undefined,
    reputationUpdates: result.reputationUpdates.map(mapReputationUpdate),
    secretRecord,
  };
}
