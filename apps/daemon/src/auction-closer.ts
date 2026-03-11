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
import { getPublicClient, getWalletClient, getAccount } from "./provider.js";
import { sendNotification } from "./notify.js";

const ETHERSCAN_URL = "https://sepolia.etherscan.io/tx";
const marketplaceAddress = config.secretMarketplaceAddress as `0x${string}`;

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
    const hash = await getWalletClient().writeContract({
      address: marketplaceAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "closeAuction",
      args: [auctionId],
    });
    const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
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
      await sendNotification(
        `Auction Closed: #${auctionId}`,
        `Auction ${auctionId} closed.\ntx: ${ETHERSCAN_URL}/${txHash}`,
        `${ETHERSCAN_URL}/${txHash}`,
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
  await runCloserCycle();

  setInterval(async () => {
    try {
      await runCloserCycle();
    } catch (err) {
      console.error("[closer] Cycle error:", err instanceof Error ? err.message : err);
    }
  }, config.auctionCloserIntervalMs);
}

// Run standalone
if (process.argv[1]?.endsWith("auction-closer.ts") || process.argv[1]?.endsWith("auction-closer.js")) {
  startAuctionCloser().catch((err) => {
    console.error("[closer] Fatal error:", err);
    process.exit(1);
  });
}
