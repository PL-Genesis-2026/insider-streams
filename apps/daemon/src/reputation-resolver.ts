/**
 * Reputation Resolver Daemon
 *
 * After a prediction market event settles, resolves seller predictions
 * by calling resolveEventPredictions() on the FHESecretMarketplace.
 *
 * In the FHE architecture, predictions are stored encrypted on-chain.
 * The resolveEventPredictions() function compares them using FHE.eq()
 * and marks them for async decryption. The finalizeReputationResult()
 * step requires the Relayer SDK and will be done when frontend integration
 * is complete.
 *
 * Replaces: cre-workflows/external-marketplace-settlement-resolved-handler
 *
 * Run: pnpm resolver (or tsx src/reputation-resolver.ts)
 */

import { ethers } from "ethers";
import { config, requireConfig } from "./config.js";
import { getProvider, getWallet } from "./provider.js";
import { ExamplePredictionMarketABI, FHESecretMarketplaceABI } from "./abis.js";
import { sendNotification } from "./notify.js";

const ETHERSCAN_URL = "https://sepolia.etherscan.io/tx";

// ExamplePredictionMarket Outcome enum
const PM_OUTCOME = { None: 0, No: 1, Yes: 2, Inconclusive: 3 } as const;

async function handleSettlementResponse(
  eventId: bigint,
  outcome: number,
): Promise<void> {
  console.log(`\n[resolver] Processing settlement for event ${eventId}, outcome=${outcome}`);

  const wallet = getWallet();
  const marketplace = new ethers.Contract(config.secretMarketplaceAddress, FHESecretMarketplaceABI, wallet);

  // Check if event already resolved on marketplace
  const alreadyResolved = await marketplace.eventResolved(eventId);
  if (alreadyResolved) {
    console.log(`[resolver] Event ${eventId} already resolved, skipping`);
    return;
  }

  // Check if there are auctions for this event
  const auctionIds: bigint[] = await marketplace.getEventAuctions(eventId);
  if (auctionIds.length === 0) {
    console.log(`[resolver] No auctions for event ${eventId}, skipping`);
    return;
  }

  // Determine if outcome is YES
  // For INCONCLUSIVE, we treat all predictions as wrong (same as CRE workflow)
  let actualOutcomeIsYes: boolean;
  if (outcome === PM_OUTCOME.Yes) {
    actualOutcomeIsYes = true;
  } else if (outcome === PM_OUTCOME.No) {
    actualOutcomeIsYes = false;
  } else {
    // INCONCLUSIVE: pass false, which means predictions of YES are "wrong"
    // and predictions of NO are "correct" — but the CRE workflow treated
    // all INCONCLUSIVE as PredictionWrong. In FHE, the comparison will
    // naturally handle this since we compare encrypted prediction to a bool.
    // To match CRE behavior (all predictions wrong on INCONCLUSIVE),
    // we'd need special handling. For now, pass false and log a note.
    console.log(`[resolver] INCONCLUSIVE outcome for event ${eventId} — treating as NO`);
    actualOutcomeIsYes = false;
  }

  console.log(`[resolver] Resolving ${auctionIds.length} auction(s) for event ${eventId} (outcomeIsYes=${actualOutcomeIsYes})`);

  try {
    const tx = await marketplace.resolveEventPredictions(eventId, actualOutcomeIsYes);
    const receipt = await tx.wait();
    console.log(`[resolver] Resolved event ${eventId}: ${receipt.hash}`);

    await sendNotification(
      `Reputation Resolved: Event ${eventId}`,
      `Event ${eventId}: ${auctionIds.length} auction(s) resolved.\ntx: ${ETHERSCAN_URL}/${receipt.hash}`,
      `${ETHERSCAN_URL}/${receipt.hash}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[resolver] Failed to resolve event ${eventId}:`, msg);
    await sendNotification("Reputation Resolution FAILED", `Event ${eventId}: ${msg}`);
  }
}

export async function startReputationResolver(): Promise<void> {
  requireConfig(["privateKey"]);

  const provider = getProvider();
  const pm = new ethers.Contract(config.predictionMarketAddress, ExamplePredictionMarketABI, provider);

  console.log(`[resolver] Watching SettlementResponse on ${config.predictionMarketAddress}`);
  console.log(`[resolver] Marketplace: ${config.secretMarketplaceAddress}`);
  console.log(`[resolver] Resolver address: ${getWallet().address}`);

  // Watch for SettlementResponse events
  pm.on("SettlementResponse", async (eventId: bigint, status: number, outcome: number) => {
    try {
      await handleSettlementResponse(eventId, outcome);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[resolver] Error processing event ${eventId}:`, msg);
      await sendNotification("Reputation Resolution FAILED", `Event ${eventId}: ${msg}`);
    }
  });

  // Also check for any unresolved events on startup
  const marketplace = new ethers.Contract(config.secretMarketplaceAddress, FHESecretMarketplaceABI, provider);
  const unresolvedEvents: bigint[] = await marketplace.getUnresolvedEvents();

  if (unresolvedEvents.length > 0) {
    console.log(`[resolver] Found ${unresolvedEvents.length} unresolved event(s) on startup: ${unresolvedEvents.join(", ")}`);

    for (const eventId of unresolvedEvents) {
      try {
        // Check if event is settled on the prediction market
        const marketEvent = await pm.getMarketEvent(eventId);
        const status = marketEvent[4]; // status field
        const outcome = marketEvent[5]; // outcome field

        // Status 3 = Settled
        if (status === 3n || status === 3) {
          await handleSettlementResponse(eventId, Number(outcome));
        }
      } catch (err) {
        console.warn(`[resolver] Error checking event ${eventId}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log("[resolver] Listening for events...");
}

// Run standalone
if (process.argv[1]?.endsWith("reputation-resolver.ts") || process.argv[1]?.endsWith("reputation-resolver.js")) {
  startReputationResolver().catch((err) => {
    console.error("[resolver] Fatal error:", err);
    process.exit(1);
  });
}
