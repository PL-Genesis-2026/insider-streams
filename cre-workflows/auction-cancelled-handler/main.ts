import { cre, type Runtime, Runner, getNetwork, bytesToHex, type EVMLog } from "@chainlink/cre-sdk";
import { keccak256, toHex, decodeEventLog, parseAbi } from "viem";
import { configSchema, type Config } from "./types";
import { refundActiveBids } from "./supabase";
import { sendNotification } from "./notify";

const FRONTEND_URL = "https://insider-streams-insider-streams-fro.vercel.app";

/** ABI for the AuctionCancelled event CRE listens for. */
const eventAbi = parseAbi([
  "event AuctionCancelled(uint256 indexed auctionId, uint256 cancelledBidAmount, string sellerId, uint256 eventId)",
]);
const eventSignature = "AuctionCancelled(uint256,uint256,string,uint256)";

/**
 * Handles AuctionCancelled events from the SecretMarketplace contract.
 * Refunds active bids in Supabase for cancelled auctions.
 */
const onLogTrigger = (runtime: Runtime<Config>, log: EVMLog): string => {
  try {
    // Decode the AuctionCancelled event
    const topics = log.topics.map((t) => bytesToHex(t)) as [
      `0x${string}`,
      ...`0x${string}`[],
    ];
    const data = bytesToHex(log.data);

    const decoded = decodeEventLog({ abi: eventAbi, data, topics });
    runtime.log(`Event name: ${decoded.eventName}`);

    const auctionId = decoded.args.auctionId as bigint;
    const cancelledBidAmount = decoded.args.cancelledBidAmount as bigint;
    const sellerId = decoded.args.sellerId as string;
    const eventId = decoded.args.eventId as bigint;

    runtime.log(
      `AuctionCancelled: auction=${auctionId}, cancelledBid=${cancelledBidAmount}, sellerId=${sellerId}`,
    );

    // Refund active bids in Supabase
    const refunded = refundActiveBids(runtime, [auctionId.toString()]);

    const bidUsdc = (Number(cancelledBidAmount) / 1e6).toFixed(2);
    const summary = `Refunded ${refunded} bid(s) for cancelled auction ${auctionId}\nSeller: ${sellerId} | Event: ${eventId} | Bid: ${bidUsdc} USDC\n${FRONTEND_URL}/auction/${auctionId}`;
    runtime.log(summary);
    sendNotification(runtime, `Bids Refunded: Auction ${auctionId}`, summary, `${FRONTEND_URL}/auction/${auctionId}`);
    return summary;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`onLogTrigger error: ${msg}`);
    sendNotification(runtime, "Force Close FAILED", msg);
    throw err;
  }
};

/**
 * Workflow init — registers log trigger for AuctionCancelled events.
 */
const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.evms[0].chainSelectorName,
    isTestnet: true,
  });
  if (!network) {
    throw new Error(`Network not found for: ${config.evms[0].chainSelectorName}`);
  }

  const evmClient = new cre.capabilities.EVMClient(
    network.chainSelector.selector,
  );

  // Compute topic hash for AuctionCancelled event
  const cancelledHash = keccak256(toHex(eventSignature));

  return [
    cre.handler(
      evmClient.logTrigger({
        addresses: [config.evms[0].secretMarketplaceAddress],
        topics: [{ values: [cancelledHash] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onLogTrigger,
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
