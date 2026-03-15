/**
 * Auction Closer Daemon
 *
 * Polls getOpenAuctions() to find expired auctions, closes them on-chain.
 * After closing, the auction is marked for async decryption (pending close).
 *
 * Replaces: cre-workflows/secret-marketplace-auction-closer
 *
 * Run: pnpm closer (or tsx src/auction-closer.ts)
 */

import { fheSecretMarketplaceAbi } from "@private-streams/common";
import { config, requireConfig } from "./config.js";
import { getPublicClient, getWalletClient, getAccount, waitForReceipt } from "./provider.js";
import { sendNotification as _sendNotification } from "./notify.js";

function sendNotification(title: string, message: string, clickUrl?: string) {
  return _sendNotification(title, message, clickUrl, config.ntfyTopicCloser);
}
import { markBids } from "./mark-bids.js";
import { withAdminLock } from "./admin-lock.js";

const ETHERSCAN_URL = "https://sepolia.etherscan.io/tx";
const marketplaceAddress = config.secretMarketplaceAddress as `0x${string}`;

function auctionUrl(auctionId: bigint): string | undefined {
  return config.frontendUrl ? `${config.frontendUrl}/auction/${auctionId}` : undefined;
}

async function findExpiredAuctions(): Promise<bigint[]> {
  const publicClient = getPublicClient();
  const openAuctions = await publicClient.readContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "getOpenAuctions",
  });
  if (openAuctions.length === 0) return [];

  const now = BigInt(Math.floor(Date.now() / 1000));
  const expired: bigint[] = [];

  for (const auctionId of openAuctions) {
    try {
      const auction = await publicClient.readContract({
        address: marketplaceAddress,
        abi: fheSecretMarketplaceAbi,
        functionName: "getAuction",
        args: [auctionId],
      });
      const endTime = auction[1]; // endTime
      if (endTime <= now) {
        expired.push(auctionId);
      }
    } catch (err) {
      console.warn(`[closer] Error reading auction ${auctionId}:`, err instanceof Error ? err.message : err);
    }
  }

  return expired;
}

async function closeAuction(auctionId: bigint): Promise<string | null> {
  try {
    console.log(`[closer] Closing auction ${auctionId}...`);
    const hash = await withAdminLock(() =>
      getWalletClient().writeContract({
        address: marketplaceAddress,
        abi: fheSecretMarketplaceAbi,
        functionName: "closeAuction",
        args: [auctionId],
      }),
    );
    const receipt = await waitForReceipt(hash);
    console.log(`[closer] Closed auction ${auctionId}: ${receipt.transactionHash}`);
    return receipt.transactionHash;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[closer] Failed to close auction ${auctionId}:`, msg);
    return null;
  }
}

async function runCloserCycle(): Promise<void> {
  const expired = await findExpiredAuctions();

  if (expired.length === 0) return;

  console.log(`[closer] Found ${expired.length} expired auction(s): ${expired.join(", ")}`);

  for (const auctionId of expired) {
    const txHash = await closeAuction(auctionId);
    if (txHash) {
      await markBids(Number(auctionId), "won");

      // Read auction metadata for richer notification
      let meta = "";
      try {
        const publicClient = getPublicClient();
        const auction = await publicClient.readContract({
          address: marketplaceAddress,
          abi: fheSecretMarketplaceAbi,
          functionName: "getAuction",
          args: [auctionId],
        });
        const sellerId = auction[0]; // sellerId
        const eventId = auction[4]; // eventId
        const eventTitle = auction[5]; // eventTitle
        meta = `\nevent: #${eventId} "${eventTitle}"\nseller: ${sellerId}`;
      } catch {
        // non-fatal — send notification without metadata
      }

      await sendNotification(
        `Auction Closed: #${auctionId}`,
        `Auction #${auctionId} closed.${meta}\ntx: ${ETHERSCAN_URL}/${txHash}`,
        auctionUrl(auctionId) ?? `${ETHERSCAN_URL}/${txHash}`,
      );
    }
  }
}

export async function startAuctionCloser(): Promise<void> {
  requireConfig(["privateKey"]);

  console.log(`[closer] Watching ${config.secretMarketplaceAddress}`);
  console.log(`[closer] Poll interval: ${config.auctionCloserIntervalMs}ms`);
  console.log(`[closer] Closer address: ${getAccount().address}`);

  // Run immediately, then on interval
  try {
    await runCloserCycle();
  } catch (err) {
    console.warn("[closer] Initial cycle failed (will retry on interval):", err instanceof Error ? err.message : String(err));
  }

  setInterval(async () => {
    try {
      await runCloserCycle();
    } catch (err) {
      console.error("[closer] Cycle error:", err instanceof Error ? err.message : err);
    }
  }, config.auctionCloserIntervalMs);

  // Watch for AuctionCancelled events to mark bids as cancelled
  getPublicClient().watchContractEvent({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    eventName: "AuctionCancelled",
    onLogs: (logs) => {
      for (const log of logs) {
        const { auctionId } = log.args as { auctionId: bigint };
        console.log(`[closer] AuctionCancelled event: auction ${auctionId}`);
        markBids(Number(auctionId), "cancelled").catch((err) => {
          console.error(`[closer] Failed to mark bids as cancelled for auction ${auctionId}:`, err);
        });
      }
    },
  });
  console.log("[closer] Watching for AuctionCancelled events");
}

// Run standalone
if (process.argv[1]?.endsWith("auction-closer.ts") || process.argv[1]?.endsWith("auction-closer.js")) {
  startAuctionCloser().catch((err) => {
    console.error("[closer] Fatal error:", err);
    process.exit(1);
  });
}
