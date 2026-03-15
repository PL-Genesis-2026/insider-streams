import { defineConfig } from "@playwright/test";

const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  // FHE encryption takes ~10s per operation, Sepolia confirmations ~15s
  timeout: 120_000,
  retries: 0,
  // Run tests serially — daemon submits FHE txs from a single admin EOA,
  // parallel tests cause nonce conflicts
  workers: 1,
  use: {
    baseURL: remoteBaseUrl || "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  // Skip local server startup when testing against a remote deployment
  ...(remoteBaseUrl
    ? {}
    : {
        webServer: [
          {
            command: "pnpm start",
            cwd: "../../apps/daemon",
            url: "http://localhost:3001/health",
            reuseExistingServer: true,
            timeout: 30_000,
          },
          {
            // Clear stale contract address env vars that may override
            // @private-streams/common values in the frontend
            command: "pnpm dev",
            url: "http://localhost:3000",
            reuseExistingServer: true,
            timeout: 30_000,
            env: {
              EXAMPLE_PREDICTION_MARKET_ADDRESS: "",
              SECRET_MARKETPLACE_ADDRESS: "",
              CONFIDENTIAL_USDC_ADDRESS: "",
            },
          },
        ],
      }),
});
