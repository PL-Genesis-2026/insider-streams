import "server-only";

import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { env } from "@/env";

function _makePublicClient() {
  return createPublicClient({ chain: sepolia, transport: http(env.RPC_URL) });
}

function _makeAdminWalletClient() {
  const ownerPk = env.OWNER_PK;
  if (!ownerPk) {
    throw new Error("Missing OWNER_PK environment variable");
  }
  return createWalletClient({
    account: privateKeyToAccount(ownerPk as Hex),
    chain: sepolia,
    transport: http(env.RPC_URL),
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
