import { NextResponse } from "next/server";
import { examplePredictionMarketAbi } from "@private-streams/common";
import { getPublicClient } from "@/lib/viem";
import { EXAMPLE_PREDICTION_MARKET_ADDRESS } from "@/lib/contract-addresses";

const EVENT_STATUS_LABELS = [
  "Open",
  "Settlement Requested",
  "Settled",
  "Needs Manual Review",
] as const;

export async function GET() {
  const publicClient = getPublicClient();
  const marketAddress = EXAMPLE_PREDICTION_MARKET_ADDRESS;

  try {
    const nextEventId = await publicClient.readContract({
      address: marketAddress,
      abi: examplePredictionMarketAbi,
      functionName: "nextEventId",
    });

    const totalEvents = Number(nextEventId);

    if (totalEvents === 0) {
      return NextResponse.json({ events: [] });
    }

    const eventIds = Array.from({ length: totalEvents }, (_, index) =>
      BigInt(index),
    );

    const events = await Promise.all(
      eventIds.map(async (eventId) => {
        const event = await publicClient.readContract({
          address: marketAddress,
          abi: examplePredictionMarketAbi,
          functionName: "getEvent",
          args: [eventId],
        });

        const statusCode = Number(event.status);

        return {
          eventId: eventId.toString(),
          title: event.question,
          creator: event.creator,
          eventOpen: event.eventOpen.toString(),
          eventClose: event.eventClose.toString(),
          eventOpenIso: new Date(
            Number(event.eventOpen) * 1000,
          ).toISOString(),
          eventCloseIso: new Date(
            Number(event.eventClose) * 1000,
          ).toISOString(),
          status: statusCode,
          statusLabel:
            EVENT_STATUS_LABELS[statusCode] ?? `Unknown status (${statusCode})`,
        };
      }),
    );

    const nowSeconds = Math.floor(Date.now() / 1000);

    return NextResponse.json({
      events: events
        .filter(
          (event) =>
            event.status === 0 && Number(event.eventClose) > nowSeconds,
        )
        .toReversed(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown contract read failure";

    return NextResponse.json(
      { error: `Failed to load prediction market events: ${message}` },
      { status: 500 },
    );
  }
}
