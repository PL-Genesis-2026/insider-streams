import { test as base, expect } from "@playwright/test";
import { installMockWallet } from "@johanneskares/wallet-mock";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { http } from "viem";
import { sepolia } from "viem/chains";

// Funded test accounts — use different accounts per spec file to avoid
// nonce conflicts when the daemon submits FHE txs from a single admin EOA.
export const TEST_ACCOUNTS = {
  // TEST_ACCOUNT_1 — wallet-connect tests (default)
  default:
    "0xe38e78bfd13899c54453206eeb5e173fa917b5e5f42000bf0523e5763424f5a8" as const,
  // TEST_ACCOUNT_2 — deposit tests
  deposit:
    "0x9d2db6cbff6b835d650c80b478c6884d478b4306d664b9fa368f644d07631897" as const,
  // TEST_ACCOUNT_3 — create-auction tests
  createAuction:
    "0x7a8ec3e637ff10271dc9521b8e0f8e19c0f195f21012f4a13b2080ddbaa3787e" as const,
  // TEST_ACCOUNT_4 — bid tests (bidder 1)
  bidder1:
    "0x732d878d1d4b8bb7c61eab6f78f74b1f163aa2c59c29f181049ae3209bd8deb4" as const,
  // TEST_ACCOUNT_5 — outbid tests (bidder 2)
  bidder2:
    "0xf319763080f34fc16dcc15412070dfcf29bea92c2cbf549fc8a6e87412602573" as const,
  // TEST_ACCOUNT_6 — cancel/close viewer
  viewer:
    "0xf1dcd38ac8cbe9a2d622d2af8fde9397fc7995f48bdc6e18aceaaab7e2248072" as const,
};

type TestFixtures = {
  walletPrivateKey: `0x${string}`;
  walletAccount: PrivateKeyAccount;
};

export const test = base.extend<TestFixtures>({
  // Each spec file can override this via test.use({ walletPrivateKey: ... })
  walletPrivateKey: [TEST_ACCOUNTS.default, { option: true }],

  walletAccount: async ({ walletPrivateKey }, use) => {
    await use(privateKeyToAccount(walletPrivateKey));
  },

  page: async ({ page, walletPrivateKey }, use) => {
    const account = privateKeyToAccount(walletPrivateKey);
    await installMockWallet({
      page,
      account,
      defaultChain: sepolia,
      transports: { [sepolia.id]: http() },
    });
    await use(page);
  },
});

// Default account for tests that don't override walletPrivateKey
export const testAccount = privateKeyToAccount(TEST_ACCOUNTS.default);

export { expect };
