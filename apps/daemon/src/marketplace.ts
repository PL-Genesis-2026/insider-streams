/**
 * FHESecretMarketplace Contract Interactions
 *
 * Wraps the admin-proxy contract calls with FHE encrypted input creation.
 * All functions:
 *   1. Create the encrypted input via @zama-fhe/relayer-sdk
 *   2. Submit the transaction from the admin wallet
 *   3. Wait for confirmation and return the tx hash
 */

import { ethers } from "ethers";
import { config } from "./config.js";
import { getWallet } from "./provider.js";
import { FHESecretMarketplaceABI } from "./abis.js";
import { encryptUint64, encryptAuctionInputs, getFhevmInstance } from "./fhe.js";

let _marketplace: ethers.Contract | null = null;

export function getMarketplace(): ethers.Contract {
  if (!_marketplace) {
    _marketplace = new ethers.Contract(
      config.secretMarketplaceAddress,
      FHESecretMarketplaceABI,
      getWallet(),
    );
  }
  return _marketplace;
}

/**
 * Deposit tokens for a pseudonymous user.
 * Called by the deposit watcher after detecting an incoming Private Token API transfer.
 */
export async function depositFor(
  userId: string,
  amount: bigint,
): Promise<string> {
  const marketplace = getMarketplace();
  const wallet = getWallet();

  const encrypted = await encryptUint64(
    config.secretMarketplaceAddress,
    wallet.address,
    amount,
  );

  console.log(`[marketplace] depositFor(${userId}, ${amount}) — submitting tx...`);
  const tx = await marketplace.depositFor(
    userId,
    encrypted.handles[0],
    encrypted.inputProof,
  );
  const receipt = await tx.wait();
  console.log(`[marketplace] depositFor confirmed: ${receipt.hash}`);
  return receipt.hash;
}

/**
 * Withdraw tokens for a pseudonymous user.
 * Called by the withdrawal handler.
 */
export async function withdrawFor(
  userId: string,
  amount: bigint,
): Promise<string> {
  const marketplace = getMarketplace();
  const wallet = getWallet();

  const encrypted = await encryptUint64(
    config.secretMarketplaceAddress,
    wallet.address,
    amount,
  );

  console.log(`[marketplace] withdrawFor(${userId}, ${amount}) — submitting tx...`);
  const tx = await marketplace.withdrawFor(
    userId,
    encrypted.handles[0],
    encrypted.inputProof,
  );
  const receipt = await tx.wait();
  console.log(`[marketplace] withdrawFor confirmed: ${receipt.hash}`);
  return receipt.hash;
}

/**
 * Place a bid on an auction.
 * The contract validates on-chain that the new bid exceeds the current bid.
 */
export async function placeBid(
  auctionId: number,
  bidderId: string,
  previousBidderId: string,
  amount: bigint,
): Promise<string> {
  const marketplace = getMarketplace();
  const wallet = getWallet();

  const encrypted = await encryptUint64(
    config.secretMarketplaceAddress,
    wallet.address,
    amount,
  );

  console.log(`[marketplace] placeBid(auction=${auctionId}, bidder=${bidderId}, amount=${amount}) — submitting tx...`);
  const tx = await marketplace.placeBid(
    auctionId,
    bidderId,
    previousBidderId,
    encrypted.handles[0],
    encrypted.inputProof,
    amount,
  );
  const receipt = await tx.wait();
  console.log(`[marketplace] placeBid confirmed: ${receipt.hash}`);
  return receipt.hash;
}

/**
 * Create an auction with encrypted prediction and secret key.
 * @returns The tx hash and the auction ID from the AuctionCreated event.
 */
export async function createAuction(
  sellerId: string,
  eventId: number,
  eventTitle: string,
  endTime: number,
  prediction: boolean,
  secretDataCid: string,
  secretKey: bigint,
): Promise<{ txHash: string; auctionId: number }> {
  const marketplace = getMarketplace();
  const wallet = getWallet();

  const encrypted = await encryptAuctionInputs(
    config.secretMarketplaceAddress,
    wallet.address,
    prediction,
    secretKey,
  );

  console.log(`[marketplace] createAuction(seller=${sellerId}, event=${eventId}) — submitting tx...`);
  const tx = await marketplace.createAuction(
    sellerId,
    eventId,
    eventTitle,
    endTime,
    encrypted.handles[0], // prediction (ebool)
    secretDataCid,
    encrypted.handles[1], // secretKey (euint256)
    encrypted.inputProof,
  );
  const receipt = await tx.wait();

  // Parse AuctionCreated event to get the auction ID
  let auctionId = -1;
  for (const log of receipt.logs) {
    try {
      const parsed = marketplace.interface.parseLog(log);
      if (parsed?.name === "AuctionCreated") {
        auctionId = Number(parsed.args[0]); // auctionId is first arg
        break;
      }
    } catch {
      // Not our event
    }
  }

  console.log(`[marketplace] createAuction confirmed: ${receipt.hash}, auctionId=${auctionId}`);
  return { txHash: receipt.hash, auctionId };
}

/**
 * Read a user's on-chain encrypted balance and decrypt it.
 * Flow: requestBalanceDecrypt (on-chain tx) → getBalance (read handle) → publicDecrypt (relayer).
 */
export async function getOnChainBalance(userId: string): Promise<bigint> {
  const marketplace = getMarketplace();

  // Get the handle first — if zero, user has no balance
  const handle: string = await marketplace.getBalance(userId);
  if (!handle || handle === ethers.ZeroHash) return 0n;

  // Mark balance handle for public decryption (on-chain tx)
  console.log(`[marketplace] requestBalanceDecrypt(${userId}) — submitting tx...`);
  const tx = await marketplace.requestBalanceDecrypt(userId);
  await tx.wait();

  // Decrypt via Zama relayer
  const instance = await getFhevmInstance();
  const result = await instance.publicDecrypt([handle]);
  const key = ethers.toBeHex(handle, 32) as `0x${string}`;
  const clearValue = result.clearValues[key];
  return BigInt(clearValue as bigint);
}
