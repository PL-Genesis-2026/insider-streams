/**
 * FHESecretMarketplace Contract Interactions
 *
 * Wraps the admin-proxy contract calls with FHE encrypted input creation.
 * All functions:
 *   1. Create the encrypted input via @zama-fhe/relayer-sdk
 *   2. Submit the transaction from the admin wallet
 *   3. Wait for confirmation and return the tx hash
 */

import { getContract, zeroHash, decodeEventLog, toHex, type GetContractReturnType } from "viem";
import { fheSecretMarketplaceAbi } from "@private-streams/common";
import { config } from "./config.js";
import { getPublicClient, getWalletClient, getAccount, waitForReceipt } from "./provider.js";
import { encryptUint64, encryptAuctionInputs, getFhevmInstance } from "./fhe.js";
import { withAdminLock } from "./admin-lock.js";

/** Convert a Uint8Array from FHE encryption to a 0x-prefixed hex string. */
function toHexBytes(bytes: Uint8Array): `0x${string}` {
  return toHex(bytes);
}

type MarketplaceContract = GetContractReturnType<
  typeof fheSecretMarketplaceAbi,
  { public: ReturnType<typeof getPublicClient>; wallet: ReturnType<typeof getWalletClient> },
  `0x${string}`
>;

let _marketplace: MarketplaceContract | null = null;

export function getMarketplace(): MarketplaceContract {
  if (!_marketplace) {
    _marketplace = getContract({
      address: config.secretMarketplaceAddress as `0x${string}`,
      abi: fheSecretMarketplaceAbi,
      client: { public: getPublicClient(), wallet: getWalletClient() },
    });
  }
  return _marketplace;
}

/**
 * Deposit tokens for a pseudonymous user.
 * Called by the /deposit API endpoint after the user transfers tokens to the platform EOA.
 */
export async function depositFor(
  userId: string,
  amount: bigint,
): Promise<string> {
  const account = getAccount();

  const encrypted = await encryptUint64(
    config.secretMarketplaceAddress,
    account.address,
    amount,
  );

  console.log(`[marketplace] depositFor(${userId}, ${amount}) — submitting tx...`);
  const hash = await withAdminLock(() =>
    getWalletClient().writeContract({
      address: config.secretMarketplaceAddress as `0x${string}`,
      abi: fheSecretMarketplaceAbi,
      functionName: "depositFor",
      args: [userId, toHexBytes(encrypted.handles[0]), toHexBytes(encrypted.inputProof)],
    }),
  );
  const receipt = await waitForReceipt(hash);
  console.log(`[marketplace] depositFor confirmed: ${receipt.transactionHash}`);
  return receipt.transactionHash;
}

/**
 * Withdraw tokens for a pseudonymous user.
 * Called by the withdrawal handler.
 */
export async function withdrawFor(
  userId: string,
  amount: bigint,
): Promise<string> {
  const account = getAccount();

  const encrypted = await encryptUint64(
    config.secretMarketplaceAddress,
    account.address,
    amount,
  );

  console.log(`[marketplace] withdrawFor(${userId}, ${amount}) — submitting tx...`);
  const hash = await withAdminLock(() =>
    getWalletClient().writeContract({
      address: config.secretMarketplaceAddress as `0x${string}`,
      abi: fheSecretMarketplaceAbi,
      functionName: "withdrawFor",
      args: [userId, toHexBytes(encrypted.handles[0]), toHexBytes(encrypted.inputProof)],
    }),
  );
  const receipt = await waitForReceipt(hash);
  console.log(`[marketplace] withdrawFor confirmed: ${receipt.transactionHash}`);
  return receipt.transactionHash;
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
  const account = getAccount();

  const encrypted = await encryptUint64(
    config.secretMarketplaceAddress,
    account.address,
    amount,
  );

  console.log(`[marketplace] placeBid(auction=${auctionId}, bidder=${bidderId}, amount=${amount}) — submitting tx...`);
  const hash = await withAdminLock(() =>
    getWalletClient().writeContract({
      address: config.secretMarketplaceAddress as `0x${string}`,
      abi: fheSecretMarketplaceAbi,
      functionName: "placeBid",
      args: [
        BigInt(auctionId),
        bidderId,
        previousBidderId,
        toHexBytes(encrypted.handles[0]),
        toHexBytes(encrypted.inputProof),
        amount,
      ],
    }),
  );
  const receipt = await waitForReceipt(hash);
  console.log(`[marketplace] placeBid confirmed: ${receipt.transactionHash}`);
  return receipt.transactionHash;
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
  const account = getAccount();

  const encrypted = await encryptAuctionInputs(
    config.secretMarketplaceAddress,
    account.address,
    prediction,
    secretKey,
  );

  console.log(`[marketplace] createAuction(seller=${sellerId}, event=${eventId}) — submitting tx...`);
  const hash = await withAdminLock(() =>
    getWalletClient().writeContract({
      address: config.secretMarketplaceAddress as `0x${string}`,
      abi: fheSecretMarketplaceAbi,
      functionName: "createAuction",
      args: [
        sellerId,
        BigInt(eventId),
        eventTitle,
        BigInt(endTime),
        toHexBytes(encrypted.handles[0]), // prediction (ebool)
        secretDataCid as `0x${string}`, // secretDataCid (bytes32) — already hex-encoded
        toHexBytes(encrypted.handles[1]), // secretKey (euint256)
        toHexBytes(encrypted.inputProof),
      ],
    }),
  );
  const receipt = await waitForReceipt(hash);

  // Parse AuctionCreated event to get the auction ID.
  // Filter by contract address to avoid matching events from other contracts
  // (e.g. TFHE executor, Gateway) that happen to share a topic signature.
  const marketplaceAddr = (config.secretMarketplaceAddress as string).toLowerCase();
  let auctionId = -1;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== marketplaceAddr) continue;
    try {
      const decoded = decodeEventLog({
        abi: fheSecretMarketplaceAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "AuctionCreated") {
        auctionId = Number((decoded.args as { auctionId: bigint }).auctionId);
        break;
      }
    } catch {
      // Not our event
    }
  }

  if (auctionId === -1) {
    console.warn(
      `[marketplace] createAuction: AuctionCreated event NOT found in ${receipt.logs.length} logs. ` +
      `Log addresses: ${receipt.logs.map((l) => l.address).join(", ")}. ` +
      `Receipt status: ${receipt.status}, tx: ${receipt.transactionHash}`,
    );
  }
  console.log(`[marketplace] createAuction confirmed: ${receipt.transactionHash}, auctionId=${auctionId}`);
  return { txHash: receipt.transactionHash, auctionId };
}

/**
 * Read a user's on-chain encrypted balance and decrypt it.
 * Flow: requestBalanceDecrypt (on-chain tx) → publicDecrypt (relayer).
 *
 * Deduplicates concurrent requests per userId — only one in-flight at a time.
 */
const _balanceInflight = new Map<string, Promise<bigint>>();

export function getOnChainBalance(userId: string): Promise<bigint> {
  const existing = _balanceInflight.get(userId);
  if (existing) {
    console.log(`[marketplace] getOnChainBalance(${userId}) — reusing in-flight request`);
    return existing;
  }

  const promise = _getOnChainBalanceImpl(userId).finally(() => {
    _balanceInflight.delete(userId);
  });
  _balanceInflight.set(userId, promise);
  return promise;
}

// Track handles that have been marked for public decryption so we don't
// submit the on-chain tx every time — only when we see a new handle.
const _decryptedHandles = new Set<string>();

async function _publicDecryptWithTimeout(
  instance: Awaited<ReturnType<typeof getFhevmInstance>>,
  handle: `0x${string}`,
): Promise<bigint> {
  const DECRYPT_TIMEOUT_MS = 60_000;
  console.log(`[marketplace] publicDecrypt(${handle}) — waiting for relayer...`);

  const decryptPromise = instance.publicDecrypt([handle]);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`publicDecrypt timed out after ${DECRYPT_TIMEOUT_MS / 1000}s`)), DECRYPT_TIMEOUT_MS),
  );
  const result = await Promise.race([decryptPromise, timeoutPromise]);

  const clearValue = result.clearValues[handle];
  if (clearValue === undefined || clearValue === null) return 0n;
  return BigInt(clearValue as bigint);
}

async function _getOnChainBalanceImpl(userId: string): Promise<bigint> {
  const publicClient = getPublicClient();
  const marketplaceAddress = config.secretMarketplaceAddress as `0x${string}`;

  // Get the handle — if zero, user has no balance
  const rawHandle = await publicClient.readContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "getBalance",
    args: [userId],
  });
  const handle = rawHandle as `0x${string}`;
  if (!handle || handle === zeroHash) return 0n;
  console.log(`[marketplace] getOnChainBalance(${userId}) — handle: ${handle}`);

  const instance = await getFhevmInstance();

  // Try publicDecrypt directly first (fast path, ~7s).
  // If the handle hasn't been marked for public decryption yet, the relayer
  // returns "not allowed for public decryption" — then we submit the on-chain
  // requestBalanceDecrypt tx and retry.
  try {
    const value = await _publicDecryptWithTimeout(instance, handle);
    _decryptedHandles.add(handle);
    console.log(`[marketplace] getOnChainBalance(${userId}) — decrypted: ${String(value)}`);
    return value;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("not allowed for public decryption")) {
      throw err; // Unknown error — don't retry
    }
    console.log(`[marketplace] Handle not yet allowed, submitting requestBalanceDecrypt...`);
  }

  // Slow path: submit requestBalanceDecrypt on-chain, then retry publicDecrypt
  const decryptTxHash = await withAdminLock(() =>
    getWalletClient().writeContract({
      address: marketplaceAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "requestBalanceDecrypt",
      args: [userId],
    }),
  );
  await waitForReceipt(decryptTxHash);

  const value = await _publicDecryptWithTimeout(instance, handle);
  _decryptedHandles.add(handle);
  console.log(`[marketplace] getOnChainBalance(${userId}) — decrypted: ${String(value)}`);
  return value;
}
