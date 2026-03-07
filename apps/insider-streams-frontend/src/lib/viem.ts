import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

function _makePublicClient() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error("Missing RPC_URL environment variable");
  }
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
}

function _makeAdminWalletClient() {
  const ownerPk = process.env.OWNER_PK;
  if (!ownerPk) {
    throw new Error("Missing OWNER_PK environment variable");
  }
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error("Missing RPC_URL environment variable");
  }
  return createWalletClient({
    account: privateKeyToAccount(ownerPk as Hex),
    chain: sepolia,
    transport: http(rpcUrl),
  });
}

export type AppPublicClient = ReturnType<typeof _makePublicClient>;
export type AppWalletClient = ReturnType<typeof _makeAdminWalletClient>;

let publicClient: AppPublicClient | undefined;
let adminWalletClient: AppWalletClient | undefined;

export function getPublicClient(): AppPublicClient {
  if (!publicClient) {
    publicClient = _makePublicClient();
  }
  return publicClient;
}

export function getAdminWalletClient(): AppWalletClient {
  if (!adminWalletClient) {
    adminWalletClient = _makeAdminWalletClient();
  }
  return adminWalletClient;
}
