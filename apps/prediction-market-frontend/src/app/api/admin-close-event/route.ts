import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { env } from "@/env";

const abi = [
  {
    type: "function",
    name: "adminCloseEvent",
    inputs: [{ name: "eventId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "events",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "question", type: "string" },
      { name: "creator", type: "address" },
      { name: "eventOpen", type: "uint256" },
      { name: "eventClose", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "outcome", type: "uint8" },
      { name: "settledAt", type: "uint256" },
      { name: "evidenceURI", type: "string" },
      { name: "confidenceBps", type: "uint16" },
      { name: "yesToken", type: "address" },
      { name: "noToken", type: "address" },
      { name: "yesReserve", type: "uint256" },
      { name: "noReserve", type: "uint256" },
      { name: "liquidityWithdrawn", type: "bool" },
    ],
    stateMutability: "view",
  },
] as const;

const CONTRACT_ADDRESS = "0xc0800a96EbfEEd4F7C9113C6D9D960d2D912004f";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const eventId = body.eventId;

    if (eventId == null) {
      return NextResponse.json(
        { error: "eventId is required" },
        { status: 400 },
      );
    }

    if (!env.OWNER_PK) {
      return NextResponse.json(
        { error: "Server not configured (missing OWNER_PK)" },
        { status: 503 },
      );
    }

    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(env.RPC_URL),
    });

    const eventData = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: "events",
      args: [BigInt(eventId)],
    });

    const status = eventData[4]; // Status enum index
    if (status !== 0) {
      const statusLabels = ["Open", "SettlementRequested", "Settled", "NeedsManual"];
      return NextResponse.json(
        { error: `Event status is ${statusLabels[status] ?? status}, must be Open` },
        { status: 400 },
      );
    }

    const account = privateKeyToAccount(env.OWNER_PK as Hex);
    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(env.RPC_URL),
    });

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi,
      functionName: "adminCloseEvent",
      args: [BigInt(eventId)],
    });

    return NextResponse.json({ hash });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Admin close event failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
