import {
  cre,
  type Runtime,
  getNetwork,
  encodeCallMsg,
  LATEST_BLOCK_NUMBER,
  bytesToHex,
} from "@chainlink/cre-sdk";
import { encodeFunctionData, decodeFunctionResult } from "viem";
import { type Config, secretMarketplaceAbi } from "./types";

export interface ExpiredAuction {
  auctionId: bigint;
  sellerId: string;
  currentBid: bigint;
  eventId: bigint;
}

/**
 * Reads on-chain state to find expired auctions that need closing.
 * 1. Calls getOpenAuctions() to get all open auction IDs
 * 2. For each, calls getAuction(id) and checks if endTime has passed
 * 3. Returns the list of expired auctions
 */
export function findExpiredAuctions(
  runtime: Runtime<Config>,
  nowSeconds: number
): ExpiredAuction[] {
  const cfg = runtime.config.evms[0];

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: cfg.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Unknown chain: ${cfg.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

  // Step 1: Get open auction IDs
  const openAuctionsCallData = encodeFunctionData({
    abi: secretMarketplaceAbi,
    functionName: "getOpenAuctions",
  });

  const openAuctionsResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: "0x0000000000000000000000000000000000000000",
        to: cfg.secretMarketplaceAddress as `0x${string}`,
        data: openAuctionsCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const openIds = decodeFunctionResult({
    abi: secretMarketplaceAbi,
    functionName: "getOpenAuctions",
    data: bytesToHex(openAuctionsResult.data),
  }) as bigint[];

  runtime.log(`Open auctions: ${openIds.length}`);

  if (openIds.length === 0) return [];

  // Step 2: Check each auction's endTime
  const expired: ExpiredAuction[] = [];

  for (const auctionId of openIds) {
    const auctionCallData = encodeFunctionData({
      abi: secretMarketplaceAbi,
      functionName: "getAuction",
      args: [auctionId],
    });

    const auctionResult = evmClient
      .callContract(runtime, {
        call: encodeCallMsg({
          from: "0x0000000000000000000000000000000000000000",
          to: cfg.secretMarketplaceAddress as `0x${string}`,
          data: auctionCallData,
        }),
        blockNumber: LATEST_BLOCK_NUMBER,
      })
      .result();

    const auction = decodeFunctionResult({
      abi: secretMarketplaceAbi,
      functionName: "getAuction",
      data: bytesToHex(auctionResult.data),
    }) as {
      sellerId: string;
      endTime: bigint;
      currentBid: bigint;
      eventId: bigint;
      eventTitle: string;
      status: number;
      reputationResolved: boolean;
    };

    const endTime = Number(auction.endTime);
    if (nowSeconds >= endTime) {
      runtime.log(
        `Auction ${auctionId} expired (endTime=${endTime}, now=${nowSeconds})`
      );
      expired.push({
        auctionId,
        sellerId: auction.sellerId,
        currentBid: auction.currentBid,
        eventId: auction.eventId,
      });
    } else {
      runtime.log(
        `Auction ${auctionId} still active (endTime=${endTime}, now=${nowSeconds})`
      );
    }
  }

  return expired;
}
