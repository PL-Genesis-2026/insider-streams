import {
  MOCK_USDC_DECIMALS,
  SECRET_MARKETPLACE_ADDRESS,
  secretMarketplaceAbi,
} from "@private-streams/common";
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  zeroAddress,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { graphqlClient } from "@/lib/graphql";
import { getSecretByAuctionId, type JsonValue } from "@/lib/supabase/secrets";
import type { AuctionDetailSubgraphQuery } from "../__generated__/sdk";
import { getSdk } from "../__generated__/sdk";

const sdk = getSdk(graphqlClient);
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

const AUCTION_STATUS_BY_CODE = {
  0: "Open",
  1: "Closed",
  2: "ForceClosed",
} as const;

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

export type AuctionDetailSellerProfile = {
  name?: string;
  reputationScore?: number;
  registered?: boolean;
  totalAuctions?: number;
};

export type AuctionDetailSecretRecord = {
  secretData: JsonValue;
  updatedAt: string;
};

export type AuctionDetailData = {
  auctionId: string;
  sellerAddress: string;
  externalMarketId: string;
  reservePriceUsdc: number;
  endTime: string;
  createdAt?: string;
  status: "Open" | "Closed" | "ForceClosed";
  currentBidUsdc?: number;
  currentBidderAddress?: string;
  automaticBetAmountUsdc?: number;
  betOnYes?: boolean;
  sellerProfile?: AuctionDetailSellerProfile;
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

type AuctionContractData = {
  sellerAddress?: string;
  externalMarketId?: string;
  reservePriceUsdc?: number;
  endTime?: string;
  status: AuctionDetailData["status"];
  currentBidUsdc?: number;
  currentBidderAddress?: string;
  automaticBetAmountUsdc?: number;
  betOnYes?: boolean;
  sellerProfile?: AuctionDetailSellerProfile;
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

function maybeAddress(value: string) {
  return value === zeroAddress ? undefined : getAddress(value);
}

function getAuctionStatus(code: number | bigint): AuctionDetailData["status"] {
  const status = AUCTION_STATUS_BY_CODE[Number(code) as 0 | 1 | 2];
  if (!status) {
    throw new Error(`Unsupported auction status code: ${code.toString()}`);
  }

  return status;
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

async function getContractAuctionData(
  auctionId: bigint,
): Promise<AuctionContractData | undefined> {
  try {
    const zero = BigInt(0);
    const auction = await publicClient.readContract({
      address: SECRET_MARKETPLACE_ADDRESS,
      abi: secretMarketplaceAbi,
      functionName: "getAuction",
      args: [auctionId],
    });
    const sellerAddress = maybeAddress(auction.seller);
    const [seller, sellerAuctions] = sellerAddress
      ? await Promise.all([
          publicClient.readContract({
            address: SECRET_MARKETPLACE_ADDRESS,
            abi: secretMarketplaceAbi,
            functionName: "getSeller",
            args: [sellerAddress as Address],
          }),
          publicClient.readContract({
            address: SECRET_MARKETPLACE_ADDRESS,
            abi: secretMarketplaceAbi,
            functionName: "getSellerAuctions",
            args: [sellerAddress as Address],
          }),
        ])
      : [undefined, undefined];

    return {
      sellerAddress,
      externalMarketId: auction.marketMetadata.marketId.toString(),
      reservePriceUsdc: bigintToUsdc(auction.reservePrice),
      endTime: scalarToIso(auction.endTime),
      status: getAuctionStatus(auction.status),
      currentBidUsdc:
        auction.currentBid === zero ? undefined : bigintToUsdc(auction.currentBid),
      currentBidderAddress: maybeAddress(auction.currentBidder),
      automaticBetAmountUsdc:
        auction.currentBid === zero
          ? undefined
          : bigintToUsdc(auction.automaticBetAmount),
      betOnYes: auction.marketMetadata.betOnYes,
      sellerProfile: seller
        ? {
            name: seller.name.trim() === "" ? undefined : seller.name,
            reputationScore: Number(seller.reputationScore),
            registered: seller.registered,
            totalAuctions: sellerAuctions?.length,
          }
        : undefined,
    };
  } catch (error) {
    console.error(`Failed to load contract data for auction ${auctionId}`, error);
    return undefined;
  }
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
  const auctionIdBigInt = scalarToBigInt(auctionId);
  const [contractData, secretRecord] = await Promise.all([
    getContractAuctionData(auctionIdBigInt),
    getSecretRecord(auctionIdBigInt),
  ]);

  if (!createdAuction && !contractData) {
    return null;
  }

  const sellerAddress =
    createdAuction?.seller !== undefined
      ? getAddress(String(createdAuction.seller))
      : contractData?.sellerAddress;
  const externalMarketId =
    createdAuction?.externalMarketId !== undefined
      ? String(createdAuction.externalMarketId)
      : contractData?.externalMarketId;
  const reservePriceUsdc =
    createdAuction?.reservePrice !== undefined
      ? bigintToUsdc(scalarToBigInt(createdAuction.reservePrice))
      : contractData?.reservePriceUsdc;
  const endTime =
    createdAuction?.endTime !== undefined
      ? scalarToIso(createdAuction.endTime)
      : contractData?.endTime;
  const createdAt =
    createdAuction?.blockTimestamp !== undefined
      ? scalarToIso(createdAuction.blockTimestamp)
      : undefined;

  if (
    sellerAddress === undefined ||
    externalMarketId === undefined ||
    reservePriceUsdc === undefined ||
    endTime === undefined
  ) {
    return null;
  }

  return {
    auctionId,
    sellerAddress,
    externalMarketId,
    reservePriceUsdc,
    endTime,
    createdAt,
    status:
      contractData?.status ??
      (forceClosedAuction
        ? "ForceClosed"
        : closedAuction
          ? "Closed"
          : "Open"),
    currentBidUsdc:
      contractData?.currentBidUsdc ??
      (closedAuction
        ? bigintToUsdc(scalarToBigInt(closedAuction.winningBid))
        : latestBid
          ? bigintToUsdc(scalarToBigInt(latestBid.amount))
          : undefined),
    currentBidderAddress:
      contractData?.currentBidderAddress ??
      (closedAuction
        ? getAddress(String(closedAuction.buyer))
        : latestBid
          ? getAddress(String(latestBid.bidder))
          : undefined),
    automaticBetAmountUsdc: contractData?.automaticBetAmountUsdc,
    betOnYes: contractData?.betOnYes,
    sellerProfile: contractData?.sellerProfile,
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
