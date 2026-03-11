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
      transport: http(config.rpcUrl),
    });
  }
  return _publicClient;
}

export function getWalletClient(): AppWalletClient {
  if (!_walletClient) {
    _walletClient = createWalletClient({
      account: getAccount(),
      chain: sepolia,
      transport: http(config.rpcUrl),
    });
  }
  return _walletClient;
}
