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
    let hasExpired = false;

    for (const auctionId of openAuctions) {
      const auction = (await publicClient.readContract({
        address: SECRET_MARKETPLACE_ADDRESS,
        abi: secretMarketplaceAbi,
        functionName: "getAuction",
        args: [auctionId],
      })) as { endTime: bigint };

      if (Number(auction.endTime) <= now) {
        log("auction-closed", `Auction ${auctionId} expired (endTime=${auction.endTime}, now=${now})`);
        hasExpired = true;
        break;
      }
    }

    if (!hasExpired) {
      log("auction-closed", `${openAuctions.length} open auction(s), none expired`);
      return;
    }

    log("auction-closed", "Triggering CRE secret-marketplace-auction-closer...");
    try {
      runCRE({
        workflow: "secret-marketplace-auction-closer",
        triggerIndex: 0,
        broadcast: true,
      });
      log("auction-closed", "CRE secret-marketplace-auction-closer completed");
      await notify("Auction expired - CRE done", `Expired auction detected, auction-closer broadcast`, ["white_check_mark"]);
    } catch (err) {
      log("auction-closed", `CRE secret-marketplace-auction-closer FAILED: ${err}`);
      await notify("Auction expired - CRE FAILED", `${err}`, ["x"]);
    }
  } finally {
    isRunning = false;
  }
}
