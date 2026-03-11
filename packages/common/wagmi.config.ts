import { defineConfig } from "@wagmi/cli";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = resolve(
  __dirname,
  "../../contracts-fhe/artifacts/contracts"
);

function loadAbi(contractDir: string, contractName: string) {
  const path = resolve(artifactsDir, contractDir, `${contractName}.json`);
  const artifact = JSON.parse(readFileSync(path, "utf-8"));
  return artifact.abi;
}

export default defineConfig({
  out: "src/__generated__/contract-types.ts",
  contracts: [
    {
      name: "FHESecretMarketplace",
      abi: loadAbi("FHESecretMarketplace.sol", "FHESecretMarketplace"),
    },
    {
      name: "FHEConfidentialUSDC",
      abi: loadAbi("FHEConfidentialUSDC.sol", "FHEConfidentialUSDC"),
    },
    {
      name: "ExamplePredictionMarket",
      abi: loadAbi("ExamplePredictionMarket.sol", "ExamplePredictionMarket"),
    },
    {
      name: "MockUSDC",
      abi: loadAbi("test/MockUSDC.sol", "MockUSDC"),
    },
  ],
});
