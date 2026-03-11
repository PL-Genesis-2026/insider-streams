import { NextResponse } from "next/server";
import { graphqlClient } from "@/lib/graphql";

const openEventsQuery = `
  query OpenPredictionMarketEvents($now: BigInt!) {
    eventCreateds(
      first: 200
      where: { eventClose_gt: $now }
      orderBy: blockTimestamp
      orderDirection: desc
    ) {
      eventId
      creator
      question
      eventOpen
      eventClose
    }
  }
`;

type OpenPredictionMarketEventsResponse = {
  eventCreateds: Array<{
    eventId: string;
    creator: string;
    question: string;
    eventOpen: string;
    eventClose: string;
  }>;
};

export async function GET() {
  try {
    const nowSeconds = Math.floor(Date.now() / 1000).toString();
    const response =
      await graphqlClient.request<OpenPredictionMarketEventsResponse>(
        openEventsQuery,
        { now: nowSeconds },
      );

    return NextResponse.json({
      events: response.eventCreateds.map((event) => ({
        eventId: String(event.eventId),
        title: event.question,
        creator: event.creator,
        eventOpen: String(event.eventOpen),
        eventClose: String(event.eventClose),
        eventOpenIso: new Date(Number(event.eventOpen) * 1000).toISOString(),
        eventCloseIso: new Date(Number(event.eventClose) * 1000).toISOString(),
        status: 0,
        statusLabel: "Open",
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown subgraph query failure";

    return NextResponse.json(
      { error: `Failed to load prediction market events: ${message}` },
      { status: 500 },
    );
  }
}
