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
import { sendNotification as _sendNotification } from "./notify.js";

function sendNotification(title: string, message: string, clickUrl?: string) {
  return _sendNotification(title, message, clickUrl, config.ntfyTopicReputation);
}
import { withAdminLock } from "./admin-lock.js";
import { getFhevmInstance } from "./fhe.js";

const ETHERSCAN_URL = "https://sepolia.etherscan.io/tx";
const marketplaceAddress = config.secretMarketplaceAddress as `0x${string}`;
const pmAddress = config.predictionMarketAddress as `0x${string}`;

// In-memory dedup: prevents concurrent processing of the same event
// (startup scan + event watcher can race)
const processingEvents = new Set<string>();

function auctionUrl(auctionId: bigint): string | undefined {
  return config.frontendUrl ? `${config.frontendUrl}/auction/${auctionId}` : undefined;
}

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
async function getSellerScore(sellerId: string): Promise<bigint | null> {
  try {
    const publicClient = getPublicClient();
    const seller = await publicClient.readContract({
      address: marketplaceAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "getSeller",
      args: [sellerId],
    });
    return seller.reputationScore;
  } catch {
    return null;
  }
}

async function finalizeEventReputations(eventId: bigint): Promise<void> {
  const publicClient = getPublicClient();

  const auctionIds = await publicClient.readContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "getEventAuctions",
    args: [eventId],
  });

  let finalized = 0;
  const details: string[] = [];
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

      // Read the auction to get seller and prediction result
      const auction = await publicClient.readContract({
        address: marketplaceAddress,
        abi: fheSecretMarketplaceAbi,
        functionName: "getAuction",
        args: [auctionId],
      });
      const sellerId = auction[0]; // sellerId field
      const score = await getSellerScore(sellerId);
      const scoreStr = score !== null ? ` (rep: ${score >= 0n ? "+" : ""}${score})` : "";
      details.push(`  #${auctionId} seller=${sellerId}${scoreStr}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[resolver] Failed to finalize auction ${auctionId}:`, msg);
      details.push(`  #${auctionId} FAILED: ${msg.slice(0, 80)}`);
    }
  }

  if (finalized > 0) {
    const summary = `Event ${eventId}: finalized ${finalized} auction(s)\n${details.join("\n")}`;
    console.log(`[resolver] ${summary}`);
    await sendNotification(
      "Reputation Finalized",
      summary,
      auctionUrl(auctionIds[0]),
    );
  }
}

async function handleSettlementResponse(
  eventId: bigint,
  outcome: number,
): Promise<void> {
  const key = eventId.toString();
  if (processingEvents.has(key)) {
    console.log(`[resolver] Event ${eventId} already being processed, skipping`);
    return;
  }
  processingEvents.add(key);

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

  // Pre-close any expired auctions with bids before resolving.
  // Without this, resolveEventPredictions() auto-cancels open auctions
  // (refunding the bidder) instead of closing them (paying the seller).
  const now = BigInt(Math.floor(Date.now() / 1000));
  for (const auctionId of auctionIds) {
    try {
      const auction = await publicClient.readContract({
        address: marketplaceAddress,
        abi: fheSecretMarketplaceAbi,
        functionName: "getAuction",
        args: [auctionId],
      });
      const endTime = auction[1]; // endTime
      const status = auction[6]; // status (0 = Open)
      if (Number(status) === 0 && endTime <= now) {
        console.log(`[resolver] Pre-closing expired auction ${auctionId} before reputation resolution`);
        const closeHash = await withAdminLock(() =>
          getWalletClient().writeContract({
            address: marketplaceAddress,
            abi: fheSecretMarketplaceAbi,
            functionName: "closeAuction",
            args: [auctionId],
          }),
        );
        await waitForReceipt(closeHash);
        console.log(`[resolver] Pre-closed auction ${auctionId}`);
      }
    } catch (err) {
      console.warn(`[resolver] Pre-close failed for auction ${auctionId}:`, err instanceof Error ? err.message : err);
    }
  }

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

    const outcomeLabel = actualOutcomeIsYes ? "YES" : "NO";
    const auctionList = auctionIds.map((id) => `#${id}`).join(", ");
    await sendNotification(
      `Reputation Resolved: Event ${eventId}`,
      `Event ${eventId}: outcome=${outcomeLabel}, ${auctionIds.length} auction(s) [${auctionList}] resolved.\ntx: ${ETHERSCAN_URL}/${txHash}`,
      auctionUrl(auctionIds[0]) ?? `${ETHERSCAN_URL}/${txHash}`,
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
  // Wrapped in try/catch so RPC timeouts don't crash the daemon.
  try {
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
  } catch (err) {
    console.warn("[resolver] Startup unresolved-events scan failed (will rely on event listener):", err instanceof Error ? err.message : String(err));
  }

  // Catch up on startup: finalize pending reputations (Step 1 done, Step 2 missing)
  // Scan all auctions for pendingReputationDecrypt == true
  try {
    await catchUpPendingFinalizations();
  } catch (err) {
    console.warn("[resolver] Startup finalization scan failed (will rely on event listener):", err instanceof Error ? err.message : String(err));
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
