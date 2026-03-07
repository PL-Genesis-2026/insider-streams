import { cre, type Runtime, Runner, getNetwork, bytesToHex, type EVMLog } from "@chainlink/cre-sdk";
import { keccak256, toHex, decodeEventLog, parseAbi } from "viem";
import { configSchema, type Config } from "./types";
import { refundActiveBids } from "./supabase";

/** ABI for the AuctionForceClosed event CRE listens for. */
const eventAbi = parseAbi([
  "event AuctionForceClosed(uint256 indexed auctionId, uint256 heldAmount, string seller, uint256 eventId, int8 reputationDelta)",
]);
const eventSignature = "AuctionForceClosed(uint256,uint256,string,uint256,int8)";

/**
 * Handles AuctionForceClosed events from the SecretMarketplace contract.
 * Refunds active bids in Supabase for force-closed auctions.
 */
const onLogTrigger = (runtime: Runtime<Config>, log: EVMLog): string => {
  try {
    // Decode the AuctionForceClosed event
    const topics = log.topics.map((t) => bytesToHex(t)) as [
      `0x${string}`,
      ...`0x${string}`[],
    ];
    const data = bytesToHex(log.data);

    const decoded = decodeEventLog({ abi: eventAbi, data, topics });
    runtime.log(`Event name: ${decoded.eventName}`);

    const auctionId = decoded.args.auctionId as bigint;
    const heldAmount = decoded.args.heldAmount as bigint;
    const seller = decoded.args.seller as string;

    runtime.log(
      `AuctionForceClosed: auction=${auctionId}, held=${heldAmount}, seller=${seller}`,
    );

    // Refund active bids in Supabase
    const refunded = refundActiveBids(runtime, [auctionId.toString()]);

    const summary = `Refunded ${refunded} bid(s) for force-closed auction ${auctionId}`;
    runtime.log(summary);
    return summary;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`onLogTrigger error: ${msg}`);
    throw err;
  }
};

/**
 * Workflow init — registers log trigger for AuctionForceClosed events.
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

  // Compute topic hash for AuctionForceClosed event
  const forceClosedHash = keccak256(toHex(eventSignature));

  return [
    cre.handler(
      evmClient.logTrigger({
        addresses: [config.evms[0].secretMarketplaceAddress],
        topics: [{ values: [forceClosedHash] }],
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
