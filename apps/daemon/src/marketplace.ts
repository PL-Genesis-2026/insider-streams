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
import { getPublicClient, getWalletClient, getAccount } from "./provider.js";
import { encryptUint64, encryptAuctionInputs, getFhevmInstance } from "./fhe.js";

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
  const hash = await getWalletClient().writeContract({
    address: config.secretMarketplaceAddress as `0x${string}`,
    abi: fheSecretMarketplaceAbi,
    functionName: "depositFor",
    args: [userId, toHexBytes(encrypted.handles[0]), toHexBytes(encrypted.inputProof)],
  });
  const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
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
  const hash = await getWalletClient().writeContract({
    address: config.secretMarketplaceAddress as `0x${string}`,
    abi: fheSecretMarketplaceAbi,
    functionName: "withdrawFor",
    args: [userId, toHexBytes(encrypted.handles[0]), toHexBytes(encrypted.inputProof)],
  });
  const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
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
  const hash = await getWalletClient().writeContract({
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
  });
  const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
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
  const hash = await getWalletClient().writeContract({
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
  });
  const receipt = await getPublicClient().waitForTransactionReceipt({ hash });

  // Parse AuctionCreated event to get the auction ID
  let auctionId = -1;
  for (const log of receipt.logs) {
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

  console.log(`[marketplace] createAuction confirmed: ${receipt.transactionHash}, auctionId=${auctionId}`);
  return { txHash: receipt.transactionHash, auctionId };
}

/**
 * Read a user's on-chain encrypted balance and decrypt it.
 * Flow: requestBalanceDecrypt (on-chain tx) → getBalance (read handle) → publicDecrypt (relayer).
 */
export async function getOnChainBalance(userId: string): Promise<bigint> {
  const publicClient = getPublicClient();
  const marketplaceAddress = config.secretMarketplaceAddress as `0x${string}`;

  // Get the handle first — if zero, user has no balance
  const handle = await publicClient.readContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "getBalance",
    args: [userId],
  });
  if (!handle || handle === zeroHash) return 0n;

  // Mark balance handle for public decryption (on-chain tx)
  console.log(`[marketplace] requestBalanceDecrypt(${userId}) — submitting tx...`);
  const txHash = await getWalletClient().writeContract({
    address: marketplaceAddress,
    abi: fheSecretMarketplaceAbi,
    functionName: "requestBalanceDecrypt",
    args: [userId],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Decrypt via Zama relayer
  const instance = await getFhevmInstance();
  const result = await instance.publicDecrypt([handle]);
  // handle is already a 0x-prefixed bytes32 hex string from readContract
  const clearValue = result.clearValues[handle as `0x${string}`];
  return BigInt(clearValue as bigint);
}
