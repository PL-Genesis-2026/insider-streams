/**
 * Auction-closed event watcher — polls getOpenAuctions() for expired auctions
 * and triggers the secret-marketplace-auction-closer CRE workflow that
 * transfers the bid amount to the seller and marks auction as closed.
 */

import type { PublicClient } from "viem";
import {
  SECRET_MARKETPLACE_ADDRESS,
  secretMarketplaceAbi,
} from "@private-streams/common";
import { runCRE } from "./cre-runner.js";
import { log } from "./index.js";
import { notify } from "./notify.js";

let isRunning = false;

export async function pollExpiredAuctions(
  publicClient: PublicClient,
): Promise<void> {
  if (isRunning) {
    log("auction-closed", "Previous run still active, skipping");
    return;
  }

  try {
    isRunning = true;

    const openAuctions = (await publicClient.readContract({
      address: SECRET_MARKETPLACE_ADDRESS,
      abi: secretMarketplaceAbi,
      functionName: "getOpenAuctions",
    })) as bigint[];

    if (openAuctions.length === 0) {
      log("auction-closed", "No open auctions");
      return;
    }

    const now = Math.floor(Date.now() / 1000);

    // Batch all getAuction() calls into a single multicall to avoid N sequential RPC requests
    const auctionResults = await publicClient.multicall({
      contracts: openAuctions.map((auctionId) => ({
        address: SECRET_MARKETPLACE_ADDRESS,
        abi: secretMarketplaceAbi,
        functionName: "getAuction" as const,
        args: [auctionId],
      })),
    });

    const expiredIds: bigint[] = [];
    for (let i = 0; i < openAuctions.length; i++) {
      const result = auctionResults[i];
      if (result.status !== "success") continue;
      const auction = result.result as { endTime: bigint };
      if (Number(auction.endTime) <= now) {
        log("auction-closed", `Auction ${openAuctions[i]} expired (endTime=${auction.endTime}, now=${now})`);
        expiredIds.push(openAuctions[i]);
      }
    }

    if (expiredIds.length === 0) {
      log("auction-closed", `${openAuctions.length} open auction(s), none expired`);
      return;
    }

    const idList = expiredIds.map(String).join(", ");
    log("auction-closed", `Triggering CRE secret-marketplace-auction-closer for ${expiredIds.length} expired auction(s): [${idList}]`);
    try {
      runCRE({
        workflow: "secret-marketplace-auction-closer",
        triggerIndex: 0,
        broadcast: true,
      });
      log("auction-closed", "CRE secret-marketplace-auction-closer completed");
      await notify(
        "Auction expired - CRE done",
        `Expired auctions: [${idList}] (${expiredIds.length} total)\nCRE: secret-marketplace-auction-closer (broadcast)\nCRE topic: https://api.insider-streams.com/secret-marketplace-auction-closer-cre`,
        ["white_check_mark"],
      );
    } catch (err) {
      log("auction-closed", `CRE secret-marketplace-auction-closer FAILED: ${err}`);
      await notify("Auction expired - CRE FAILED", `Expired auctions: [${idList}] (${expiredIds.length} total)\nCRE: secret-marketplace-auction-closer\n${err}`, ["x"]);
    }
  } finally {
    isRunning = false;
  }
}
