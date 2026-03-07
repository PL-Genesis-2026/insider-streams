import { cre, type Runtime, Runner, getNetwork, type CronPayload } from "@chainlink/cre-sdk";
import { configSchema, CRON_SCHEDULE, type Config } from "./types";
import { findExpiredAuctions } from "./monitor";
import { closeAuction } from "./close";
import { settleWinningBids } from "./supabase";

/**
 * Cron handler — fires on schedule, checks for expired auctions, closes them,
 * then settles winning bids in Supabase.
 */
const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    runtime.log(`Cron fired — checking for expired auctions (now=${nowSeconds})`);

    const expired = findExpiredAuctions(runtime, nowSeconds);

    if (expired.length === 0) {
      runtime.log("No expired auctions found");
      return "No expired auctions";
    }

    runtime.log(`Found ${expired.length} expired auction(s) to close`);

    // Phase 1: Close all expired auctions on-chain
    const closedAuctionIds: string[] = [];
    const results: string[] = [];
    for (const auction of expired) {
      try {
        const txHash = closeAuction(runtime, auction.auctionId);
        closedAuctionIds.push(auction.auctionId.toString());
        results.push(`Auction ${auction.auctionId}: closed (tx=${txHash})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.log(`Failed to close auction ${auction.auctionId}: ${msg}`);
        results.push(`Auction ${auction.auctionId}: FAILED (${msg})`);
      }
    }

    // Phase 2: Settle winning bids in Supabase (batched — 2 HTTP calls total)
    if (closedAuctionIds.length > 0) {
      try {
        const settled = settleWinningBids(runtime, closedAuctionIds);
        results.push(`Settled ${settled} winning bid(s) in Supabase`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.log(`Bid settlement failed: ${msg}`);
        results.push(`Bid settlement: FAILED (${msg})`);
        // Don't throw — on-chain closes already succeeded
      }
    }

    const summary = results.join("; ");
    runtime.log(summary);
    return summary;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`onCronTrigger error: ${msg}`);
    throw err;
  }
};

/**
 * Workflow init — registers cron trigger to check every 30 seconds.
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

  const cronCap = new cre.capabilities.CronCapability();

  return [
    cre.handler(
      cronCap.trigger({ schedule: CRON_SCHEDULE }),
      onCronTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
