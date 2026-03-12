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

import { examplePredictionMarketAbi, fheSecretMarketplaceAbi } from "@private-streams/common";
import { config, requireConfig } from "./config.js";
import { getPublicClient, getWalletClient, getAccount } from "./provider.js";
import { sendNotification } from "./notify.js";
import { withAdminLock } from "./admin-lock.js";

const ETHERSCAN_URL = "https://sepolia.etherscan.io/tx";
const marketplaceAddress = config.secretMarketplaceAddress as `0x${string}`;
const pmAddress = config.predictionMarketAddress as `0x${string}`;

// ExamplePredictionMarket Outcome enum
const PM_OUTCOME = { None: 0, No: 1, Yes: 2, Inconclusive: 3 } as const;

async function handleSettlementResponse(
  eventId: bigint,
  outcome: number,
): Promise<void> {
  console.log(`\n[resolver] Processing settlement for event ${eventId}, outcome=${outcome}`);

  const publicClient = getPublicClient();

  // Check if event already resolved on marketplace
  const alreadyResolved = await publicClient.readContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "eventResolved",
    args: [eventId],
  });
  if (alreadyResolved) {
    console.log(`[resolver] Event ${eventId} already resolved, skipping`);
    return;
  }

  // Check if there are auctions for this event
  const auctionIds = await publicClient.readContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "getEventAuctions",
    args: [eventId],
  });
  if (auctionIds.length === 0) {
    console.log(`[resolver] No auctions for event ${eventId}, skipping`);
    return;
  }

  // Determine if outcome is YES
  let actualOutcomeIsYes: boolean;
  if (outcome === PM_OUTCOME.Yes) {
    actualOutcomeIsYes = true;
  } else if (outcome === PM_OUTCOME.No) {
    actualOutcomeIsYes = false;
  } else {
    console.log(`[resolver] INCONCLUSIVE outcome for event ${eventId} — treating as NO`);
    actualOutcomeIsYes = false;
  }

  console.log(`[resolver] Resolving ${auctionIds.length} auction(s) for event ${eventId} (outcomeIsYes=${actualOutcomeIsYes})`);

  try {
    const txHash = await withAdminLock(async () => {
      const hash = await getWalletClient().writeContract({
        address: marketplaceAddress,
        abi: fheSecretMarketplaceAbi,
        functionName: "resolveEventPredictions",
        args: [eventId, actualOutcomeIsYes],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.transactionHash;
    });
    console.log(`[resolver] Resolved event ${eventId}: ${txHash}`);

    await sendNotification(
      `Reputation Resolved: Event ${eventId}`,
      `Event ${eventId}: ${auctionIds.length} auction(s) resolved.\ntx: ${ETHERSCAN_URL}/${txHash}`,
      `${ETHERSCAN_URL}/${txHash}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[resolver] Failed to resolve event ${eventId}:`, msg);
    await sendNotification("Reputation Resolution FAILED", `Event ${eventId}: ${msg}`);
  }
}

export async function startReputationResolver(): Promise<void> {
  requireConfig(["privateKey"]);

  const publicClient = getPublicClient();

  console.log(`[resolver] Watching SettlementResponse on ${config.predictionMarketAddress}`);
  console.log(`[resolver] Marketplace: ${config.secretMarketplaceAddress}`);
  console.log(`[resolver] Resolver address: ${getAccount().address}`);

  // Watch for SettlementResponse events
  publicClient.watchContractEvent({
    address: pmAddress,
    abi: examplePredictionMarketAbi,
    eventName: "SettlementResponse",
    onLogs: (logs) => {
      for (const log of logs) {
        const { eventId, outcome } = log.args as { eventId: bigint; status: number; outcome: number };
        handleSettlementResponse(eventId, outcome).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[resolver] Error processing event ${eventId}:`, msg);
          sendNotification("Reputation Resolution FAILED", `Event ${eventId}: ${msg}`);
        });
      }
    },
  });

  // Also check for any unresolved events on startup
  const unresolvedEvents = await publicClient.readContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "getUnresolvedEvents",
  });

  if (unresolvedEvents.length > 0) {
    console.log(`[resolver] Found ${unresolvedEvents.length} unresolved event(s) on startup: ${unresolvedEvents.join(", ")}`);

    for (const eventId of unresolvedEvents) {
      try {
        // Check if event is settled on the prediction market
        const marketEvent = await publicClient.readContract({
          address: pmAddress,
          abi: examplePredictionMarketAbi,
          functionName: "getMarketEvent",
          args: [eventId],
        });

        // Status 3 = Settled
        if (marketEvent.status === 3) {
          await handleSettlementResponse(eventId, Number(marketEvent.outcome));
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
