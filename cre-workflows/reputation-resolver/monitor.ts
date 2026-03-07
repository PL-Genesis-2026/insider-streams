import {
  cre,
  type Runtime,
  getNetwork,
  encodeCallMsg,
  LATEST_BLOCK_NUMBER,
  bytesToHex,
} from "@chainlink/cre-sdk";
import { encodeFunctionData, decodeFunctionResult } from "viem";
import { type Config, secretMarketplaceAbi, examplePredictionMarketAbi, STATUS_SETTLED, OUTCOME_NO, OUTCOME_YES } from "./types";

export interface SettledEvent {
  eventId: bigint;
  outcome: number; // 1=No, 2=Yes
  auctionIds: bigint[];
}

export function findSettledUnresolvedEvents(
  runtime: Runtime<Config>,
): SettledEvent[] {
  const cfg = runtime.config.evms[0];

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: cfg.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Unknown chain: ${cfg.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

  // Step 1: Get unresolved event IDs from SecretMarketplace
  const unresolvedCallData = encodeFunctionData({
    abi: secretMarketplaceAbi,
    functionName: "getUnresolvedEvents",
  });

  const unresolvedResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: "0x0000000000000000000000000000000000000000",
        to: cfg.secretMarketplaceAddress as `0x${string}`,
        data: unresolvedCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const unresolvedIds = decodeFunctionResult({
    abi: secretMarketplaceAbi,
    functionName: "getUnresolvedEvents",
    data: bytesToHex(unresolvedResult.data),
  }) as bigint[];

  runtime.log(`Unresolved events: ${unresolvedIds.length}`);

  if (unresolvedIds.length === 0) return [];

  // Step 2: Check each event on ExamplePredictionMarket
  const settledEvents: SettledEvent[] = [];

  for (const eventId of unresolvedIds) {
    const getEventCallData = encodeFunctionData({
      abi: examplePredictionMarketAbi,
      functionName: "getEvent",
      args: [eventId],
    });

    const eventResult = evmClient
      .callContract(runtime, {
        call: encodeCallMsg({
          from: "0x0000000000000000000000000000000000000000",
          to: cfg.examplePredictionMarketAddress as `0x${string}`,
          data: getEventCallData,
        }),
        blockNumber: LATEST_BLOCK_NUMBER,
      })
      .result();

    const eventData = decodeFunctionResult({
      abi: examplePredictionMarketAbi,
      functionName: "getEvent",
      data: bytesToHex(eventResult.data),
    }) as {
      question: string;
      creator: string;
      eventOpen: bigint;
      eventClose: bigint;
      status: number;
      outcome: number;
      settledAt: bigint;
      evidenceURI: string;
      confidenceBps: number;
      yesToken: string;
      noToken: string;
      yesReserve: bigint;
      noReserve: bigint;
      liquidityWithdrawn: boolean;
    };

    if (eventData.status !== STATUS_SETTLED) {
      runtime.log(`Event ${eventId}: not settled (status=${eventData.status}), skipping`);
      continue;
    }

    if (eventData.outcome !== OUTCOME_YES && eventData.outcome !== OUTCOME_NO) {
      runtime.log(`Event ${eventId}: outcome=${eventData.outcome} (not Yes/No), skipping`);
      continue;
    }

    // Step 3: Get auction IDs for this event
    const getAuctionsCallData = encodeFunctionData({
      abi: secretMarketplaceAbi,
      functionName: "getEventAuctions",
      args: [eventId],
    });

    const auctionsResult = evmClient
      .callContract(runtime, {
        call: encodeCallMsg({
          from: "0x0000000000000000000000000000000000000000",
          to: cfg.secretMarketplaceAddress as `0x${string}`,
          data: getAuctionsCallData,
        }),
        blockNumber: LATEST_BLOCK_NUMBER,
      })
      .result();

    const auctionIds = decodeFunctionResult({
      abi: secretMarketplaceAbi,
      functionName: "getEventAuctions",
      data: bytesToHex(auctionsResult.data),
    }) as bigint[];

    runtime.log(`Event ${eventId}: settled (outcome=${eventData.outcome}), ${auctionIds.length} auction(s)`);

    settledEvents.push({
      eventId,
      outcome: eventData.outcome,
      auctionIds,
    });
  }

  return settledEvents;
}
