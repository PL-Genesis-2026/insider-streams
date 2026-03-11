/**
 * Auction Closer Daemon
 *
 * Polls getOpenAuctions() to find expired auctions, closes them on-chain.
 * After closing, the auction is marked for async decryption (pending close).
 *
 * NOTE: The async decryption relay (publicDecrypt + finalizeAuctionClose) requires
 * the Zama Relayer SDK and will be implemented when the frontend integration is done.
 * For now, this daemon handles the on-chain close step.
 *
 * Replaces: cre-workflows/secret-marketplace-auction-closer
 *
 * Run: pnpm closer (or tsx src/auction-closer.ts)
 */

import { ethers } from "ethers";
import { config, requireConfig } from "./config.js";
import { getProvider, getWallet } from "./provider.js";
import { FHESecretMarketplaceABI } from "./abis.js";
import { sendNotification } from "./notify.js";

const ETHERSCAN_URL = "https://sepolia.etherscan.io/tx";

async function findExpiredAuctions(marketplace: ethers.Contract): Promise<bigint[]> {
  const openAuctions: bigint[] = await marketplace.getOpenAuctions();
  if (openAuctions.length === 0) return [];

  const now = BigInt(Math.floor(Date.now() / 1000));
  const expired: bigint[] = [];

  for (const auctionId of openAuctions) {
    try {
      const auction = await marketplace.getAuction(auctionId);
      const endTime = auction[1]; // endTime is 2nd return value (after sellerId)
      if (endTime <= now) {
        expired.push(auctionId);
      }
    } catch (err) {
      console.warn(`[closer] Error reading auction ${auctionId}:`, err instanceof Error ? err.message : err);
    }
  }

  return expired;
}

async function closeAuction(marketplace: ethers.Contract, auctionId: bigint): Promise<string | null> {
  try {
    console.log(`[closer] Closing auction ${auctionId}...`);
    const tx = await marketplace.closeAuction(auctionId);
    const receipt = await tx.wait();
    console.log(`[closer] Closed auction ${auctionId}: ${receipt.hash}`);
    return receipt.hash;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[closer] Failed to close auction ${auctionId}:`, msg);
    return null;
  }
}

async function runCloserCycle(): Promise<void> {
  const wallet = getWallet();
  const marketplace = new ethers.Contract(config.secretMarketplaceAddress, FHESecretMarketplaceABI, wallet);

  const expired = await findExpiredAuctions(
    new ethers.Contract(config.secretMarketplaceAddress, FHESecretMarketplaceABI, getProvider()),
  );

  if (expired.length === 0) return;

  console.log(`[closer] Found ${expired.length} expired auction(s): ${expired.join(", ")}`);

  for (const auctionId of expired) {
    const txHash = await closeAuction(marketplace, auctionId);
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
  console.log(`[closer] Closer address: ${getWallet().address}`);

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
