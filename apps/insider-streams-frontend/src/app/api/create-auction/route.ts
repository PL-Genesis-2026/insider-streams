import { NextResponse } from "next/server";
import { proxyToDaemon } from "@/lib/daemon-client";
import {
  createAuctionRequestSchema,
  CREATE_AUCTION_DURATION_SECONDS,
  type CreateAuctionDuration,
} from "@/lib/create-auction/shared";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createAuctionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { eventId, eventTitle, privateLeg, secretPayload, duration, timestamp, signature } =
    parsed.data;

  // Compute auction endTime from duration
  const durationSeconds =
    CREATE_AUCTION_DURATION_SECONDS[duration as CreateAuctionDuration];
  const endTime = timestamp + durationSeconds;

  // Transform frontend fields → daemon API fields
  const daemonBody = {
    eventId,
    eventTitle,
    endTime: String(endTime),
    prediction: privateLeg === "yes" ? "true" : "false",
    secretPayload,
    timestamp,
    signature,
  };

  const res = await proxyToDaemon("/create-auction", daemonBody);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
