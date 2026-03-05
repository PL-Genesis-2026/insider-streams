import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

export default defineConfig({
  out: "src/generated.ts",
  plugins: [
    foundry({
      project: "..",
      include: ["Auction.sol/Auction.json", "SimpleMarket.sol/SimpleMarket.json", "MockUSDC.sol/MockUSDC.json"],
      forge: { build: false },
    }),
  ],
});
