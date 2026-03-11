import "server-only";

import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { env } from "@/env";

function _makePublicClient() {
  return createPublicClient({ chain: sepolia, transport: http(env.RPC_URL) });
}

export type AppPublicClient = ReturnType<typeof _makePublicClient>;

let publicClient: AppPublicClient | undefined;

export function getPublicClient(): AppPublicClient {
  if (!publicClient) {
    publicClient = _makePublicClient();
  }
  return publicClient;
}
