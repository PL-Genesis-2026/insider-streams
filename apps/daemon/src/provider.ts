import { createPublicClient, createWalletClient, http, type PublicClient, type Chain, type Transport } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { config } from "./config.js";

type AppWalletClient = ReturnType<typeof createWalletClient<Transport, Chain, PrivateKeyAccount>>;

let _publicClient: PublicClient | null = null;
let _walletClient: AppWalletClient | null = null;
let _account: PrivateKeyAccount | null = null;

export function getAccount(): PrivateKeyAccount {
  if (!_account) {
    _account = privateKeyToAccount(config.privateKey as `0x${string}`);
  }
  return _account;
}

export function getPublicClient(): PublicClient {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: sepolia,
      transport: http(config.rpcUrl, { timeout: 30_000 }),
      // Viem defaults to 4s polling for watchContractEvent (eth_getLogs) and
      // waitForTransactionReceipt. With 4 event watchers running continuously,
      // the default burns ~6.5M Alchemy CU/day. 60s reduces that by ~93%.
      // Safe on Sepolia: 60s ≈ 5 blocks, well under eth_getLogs range limits.
      pollingInterval: 60_000,
    });
  }
  return _publicClient;
}

export function getWalletClient(): AppWalletClient {
  if (!_walletClient) {
    _walletClient = createWalletClient({
      account: getAccount(),
      chain: sepolia,
      transport: http(config.rpcUrl, { timeout: 30_000 }),
    });
  }
  return _walletClient;
}

/** waitForTransactionReceipt with retry — Sepolia public RPCs sometimes return
 *  "transaction indexing is in progress" which viem doesn't handle gracefully. */
export async function waitForReceipt(hash: `0x${string}`, maxAttempts = 10) {
  const client = getPublicClient();
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await client.waitForTransactionReceipt({ hash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("indexing is in progress") && i < maxAttempts - 1) {
        console.log(`[provider] Tx receipt pending (attempt ${i + 1}/${maxAttempts}), retrying in 5s...`);
        await new Promise((r) => setTimeout(r, 5_000));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Transaction receipt not available after ${maxAttempts} attempts`);
}
