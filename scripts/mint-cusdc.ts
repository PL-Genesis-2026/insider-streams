/**
 * mint-cusdc.ts — One-off mint of ConfidentialUSDC to an address
 *
 * Env: OWNER_PK (must be token owner), RPC_URL (optional, defaults to Sepolia)
 *
 * Usage: pnpm tsx --env-file=.env scripts/mint-cusdc.ts [amount] [recipient]
 * Example: pnpm tsx --env-file=.env scripts/mint-cusdc.ts 100000 0x3aeE...
 */

import "dotenv/config";

import { confidentialUsdcAbi } from "@private-streams/common";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const TOKEN = "0xee3A0Cccb31fF816615C18E1d1DB480df8a0f9F1" as Address;
const DECIMALS = 6;

function envRequired(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`ERROR: ${name} not set`);
    process.exit(1);
  }
  return val;
}

async function main() {
  const amountDisplay = process.argv[2] ?? "100000";
  const recipient = (process.argv[3] ?? "0x3aeE8108d04090f68d16d1Ac9Bd8e4459D39003e") as Address;
  const amount = BigInt(amountDisplay) * 10n ** BigInt(DECIMALS);

  const raw = envRequired("OWNER_PK").trim().replace(/^["']|["']$/g, "");
  const ownerPk = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  const rpcUrl = process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

  const account = privateKeyToAccount(ownerPk);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });

  console.log(`Minting ${formatUnits(amount, DECIMALS)} CUSDC to ${recipient}...`);

  const hash = await walletClient!.writeContract({
    address: TOKEN,
    abi: confidentialUsdcAbi,
    functionName: "mint",
    args: [recipient, amount],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Minted. Tx: ${hash}`);
  console.log(`Block: ${receipt.blockNumber}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
