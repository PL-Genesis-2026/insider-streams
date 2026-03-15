import "server-only";

import { privateKeyToAccount } from "viem/accounts";
import { env } from "@/env";

export function getOwnerAddress(): string | null {
  if (!env.OWNER_PK) {
    return null;
  }

  const privateKey = env.OWNER_PK.startsWith("0x")
    ? env.OWNER_PK
    : `0x${env.OWNER_PK}`;

  return privateKeyToAccount(privateKey as `0x${string}`).address.toLowerCase();
}
