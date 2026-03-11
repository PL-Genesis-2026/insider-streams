import { test as base } from "@playwright/test";
import { installMockWallet } from "@johanneskares/wallet-mock";
import { privateKeyToAccount } from "viem/accounts";
import { http } from "viem";
import { sepolia } from "viem/chains";

const WALLET_PK =
  "0x71411dc285670961e39ce06d84499190f2c47e309bebbb3192951fdfe8d2794e" as const;

export const testAccount = privateKeyToAccount(WALLET_PK);

export const test = base.extend({
  page: async ({ page }, use) => {
    await installMockWallet({
      page,
      account: testAccount,
      defaultChain: sepolia,
      transports: { [sepolia.id]: http() },
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";
