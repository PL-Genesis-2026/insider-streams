import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  examplePredictionMarketAbi,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
} from "@private-streams/common";
import { env } from "@/env";

const CONTRACT_ADDRESS = EXAMPLE_PREDICTION_MARKET_ADDRESS as Address;

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
        { error: "Server not configured for settlement (missing OWNER_PK)" },
        { status: 503 },
      );
    }

    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(env.RPC_URL),
    });

    const eventData = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: examplePredictionMarketAbi,
      functionName: "getEvent",
      args: [BigInt(eventId)],
    });

    const statusLabels = [
      "Open",
      "SettlementRequested",
      "Settled",
      "NeedsManual",
    ];

    if (eventData.status !== 0) {
      return NextResponse.json(
        {
          error: `Event status is ${statusLabels[eventData.status] ?? eventData.status}, must be Open`,
        },
        { status: 400 },
      );
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    if (eventData.eventClose > now) {
      return NextResponse.json(
        { error: "Event has not closed yet" },
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
      abi: examplePredictionMarketAbi,
      functionName: "requestSettlement",
      args: [BigInt(eventId)],
    });

    return NextResponse.json({ hash });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Settlement request failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
