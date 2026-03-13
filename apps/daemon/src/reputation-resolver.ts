/**
 * Reputation Resolver Daemon
 *
 * After a prediction market event settles, resolves seller predictions
 * by calling resolveEventPredictions() on the FHESecretMarketplace,
 * then finalizes each auction's reputation via the Zama Relayer:
 *   1. resolveEventPredictions() — FHE.eq() comparison, marks for async decrypt
 *   2. publicDecrypt() — relayer decrypts the boolean + returns proof
 *   3. finalizeReputationResult() — on-chain score update (+1 / -1)
 *
 * Replaces: cre-workflows/external-marketplace-settlement-resolved-handler
 *
 * Run: pnpm resolver (or tsx src/reputation-resolver.ts)
 */

import { examplePredictionMarketAbi, fheSecretMarketplaceAbi } from "@private-streams/common";
import { zeroHash } from "viem";
import { config, requireConfig } from "./config.js";
import { getPublicClient, getWalletClient, getAccount, waitForReceipt } from "./provider.js";
import { sendNotification } from "./notify.js";
import { withAdminLock } from "./admin-lock.js";
import { getFhevmInstance } from "./fhe.js";

const ETHERSCAN_URL = "https://sepolia.etherscan.io/tx";
const marketplaceAddress = config.secretMarketplaceAddress as `0x${string}`;
const pmAddress = config.predictionMarketAddress as `0x${string}`;

// ExamplePredictionMarket Outcome enum
const PM_OUTCOME = { None: 0, No: 1, Yes: 2, Inconclusive: 3 } as const;

const DECRYPT_TIMEOUT_MS = 120_000;

/**
 * Finalize reputation for a single auction: decrypt the FHE comparison
 * result via the Zama Relayer, then submit the proof on-chain.
 */
async function finalizeAuctionReputation(auctionId: bigint): Promise<void> {
  const publicClient = getPublicClient();

  // Read the encrypted handle for this auction
  const handle = await publicClient.readContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "pendingIsCorrectHandle",
    args: [auctionId],
  }) as `0x${string}`;

  if (!handle || handle === zeroHash) {
    console.log(`[resolver] Auction ${auctionId}: no prediction handle, skipping finalization`);
    return;
  }

  console.log(`[resolver] Auction ${auctionId}: decrypting reputation handle ${handle}...`);

  // Decrypt via Zama Relayer — returns cleartext boolean + proof
  const instance = await getFhevmInstance();
  const decryptPromise = instance.publicDecrypt([handle]);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`publicDecrypt timed out after ${DECRYPT_TIMEOUT_MS / 1000}s`)), DECRYPT_TIMEOUT_MS),
  );
  const result = await Promise.race([decryptPromise, timeoutPromise]);

  const predictionWasCorrect = Boolean(result.clearValues[handle]);
  const decryptionProof = result.decryptionProof;

  console.log(`[resolver] Auction ${auctionId}: predictionWasCorrect=${predictionWasCorrect}, submitting finalization...`);

  // Submit on-chain
  const hash = await withAdminLock(() =>
    getWalletClient().writeContract({
      address: marketplaceAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "finalizeReputationResult",
      args: [auctionId, predictionWasCorrect, decryptionProof],
    }),
  );
  await waitForReceipt(hash);
  console.log(`[resolver] Auction ${auctionId}: reputation finalized (correct=${predictionWasCorrect})`);
}

/**
 * Finalize reputation for all pending auctions tied to an event.
 * Errors on individual auctions are logged but don't stop the rest.
 */
async function finalizeEventReputations(eventId: bigint): Promise<void> {
  const publicClient = getPublicClient();

  const auctionIds = await publicClient.readContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "getEventAuctions",
    args: [eventId],
  });

  let finalized = 0;
  for (const auctionId of auctionIds) {
    const pending = await publicClient.readContract({
      address: marketplaceAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "pendingReputationDecrypt",
      args: [auctionId],
    });
    if (!pending) continue;

    try {
      await finalizeAuctionReputation(auctionId);
      finalized++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[resolver] Failed to finalize auction ${auctionId}:`, msg);
    }
  }

  if (finalized > 0) {
    const msg = `Event ${eventId}: finalized reputation for ${finalized} auction(s)`;
    console.log(`[resolver] ${msg}`);
    await sendNotification("Reputation Finalized", msg);
  }
}

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
    console.log(`[resolver] Event ${eventId} already resolved, skipping resolveEventPredictions`);
    // Even if already resolved, there may be pending finalizations
    await finalizeEventReputations(eventId);
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
    const hash = await withAdminLock(() =>
      getWalletClient().writeContract({
        address: marketplaceAddress,
        abi: fheSecretMarketplaceAbi,
        functionName: "resolveEventPredictions",
        args: [eventId, actualOutcomeIsYes],
      }),
    );
    const resolveReceipt = await waitForReceipt(hash);
    const txHash = resolveReceipt.transactionHash;
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
    return; // Don't attempt finalization if resolve failed
  }

  // Step 2: Finalize reputation for each auction (decrypt + submit proof)
  await finalizeEventReputations(eventId);
}

/**
 * Scan all existing auctions for pending reputation finalizations.
 * This catches auctions where resolveEventPredictions was called (Step 1)
 * but finalizeReputationResult was never called (Step 2).
 */
async function catchUpPendingFinalizations(): Promise<void> {
  const publicClient = getPublicClient();

  const nextAuctionId = await publicClient.readContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "nextAuctionId",
  });

  // Collect pending auction IDs in a single pass
  const pendingIds: bigint[] = [];
  for (let i = 0n; i < nextAuctionId; i++) {
    try {
      const pending = await publicClient.readContract({
        address: marketplaceAddress,
        abi: fheSecretMarketplaceAbi,
        functionName: "pendingReputationDecrypt",
        args: [i],
      });
      if (pending) pendingIds.push(i);
    } catch {
      // Auction may not exist
    }
  }

  if (pendingIds.length === 0) {
    console.log("[resolver] No pending reputation finalizations found");
    return;
  }

  console.log(`[resolver] Found ${pendingIds.length} auction(s) with pending reputation finalization: [${pendingIds.join(", ")}]`);

  for (const auctionId of pendingIds) {
    try {
      await finalizeAuctionReputation(auctionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[resolver] Failed to finalize auction ${auctionId}:`, msg);
    }
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

  // Catch up on startup: handle unresolved events (Step 1 not done yet)
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

        // Status 2 = Settled (Open=0, SettlementRequested=1, Settled=2, NeedsManual=3)
        if (marketEvent.status === 2) {
          await handleSettlementResponse(eventId, Number(marketEvent.outcome));
        }
      } catch (err) {
        console.warn(`[resolver] Error checking event ${eventId}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // Catch up on startup: finalize pending reputations (Step 1 done, Step 2 missing)
  // Scan all auctions for pendingReputationDecrypt == true
  await catchUpPendingFinalizations();

  console.log("[resolver] Listening for events...");
}

// Run standalone
if (process.argv[1]?.endsWith("reputation-resolver.ts") || process.argv[1]?.endsWith("reputation-resolver.js")) {
  startReputationResolver().catch((err) => {
    console.error("[resolver] Fatal error:", err);
    process.exit(1);
  });
}
