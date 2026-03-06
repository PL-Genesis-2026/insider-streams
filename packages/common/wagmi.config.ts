import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

export default defineConfig({
  out: "src/__generated__/contract-types.ts",
  plugins: [
    foundry({
      project: "../../contracts",
      include: ["SecretMarketplace.sol/SecretMarketplace.json", "SimpleMarket.sol/SimpleMarket.json", "MockUSDC.sol/MockUSDC.json"],
      forge: { build: false },
    }),
  ],
});
