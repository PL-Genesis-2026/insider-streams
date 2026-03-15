import { NextResponse } from "next/server";
import { proxyToDaemon, proxyFormDataToDaemon } from "@/lib/daemon-client";
import {
  createAuctionRequestSchema,
  CREATE_AUCTION_DURATION_SECONDS,
  type CreateAuctionDuration,
} from "@/lib/create-auction/shared";

export const maxDuration = 90;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  // Multipart FormData — forward to daemon as multipart
  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();

      // Validate form fields before forwarding
      const parsed = createAuctionRequestSchema.safeParse({
        eventId: formData.get("eventId"),
        eventTitle: formData.get("eventTitle"),
        privateLeg: formData.get("privateLeg"),
        secretPayload: formData.get("secretPayload"),
        duration: formData.get("duration"),
        timestamp: formData.get("timestamp"),
        signature: formData.get("signature"),
      });

      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error: parsed.error.issues.map((i) => i.message).join("; "),
            code: "VALIDATION_ERROR",
          },
          { status: 400 },
        );
      }

      // Compute endTime from duration + timestamp
      const durationSeconds =
        CREATE_AUCTION_DURATION_SECONDS[parsed.data.duration as CreateAuctionDuration];
      const endTime = parsed.data.timestamp + durationSeconds;

      // Build daemon FormData with transformed fields
      const daemonFormData = new FormData();
      daemonFormData.set("eventId", parsed.data.eventId);
      daemonFormData.set("eventTitle", parsed.data.eventTitle);
      daemonFormData.set("endTime", String(endTime));
      daemonFormData.set("prediction", parsed.data.privateLeg === "yes" ? "true" : "false");
      daemonFormData.set("secretPayload", parsed.data.secretPayload ?? "");
      daemonFormData.set("timestamp", String(parsed.data.timestamp));
      daemonFormData.set("signature", parsed.data.signature);

      // Forward file if present
      const file = formData.get("file");
      if (file instanceof File) {
        daemonFormData.set("file", file);
      }

      const res = await proxyFormDataToDaemon("/create-auction", daemonFormData);
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "FormData proxy failed";
      console.error("[api/create-auction]", msg);
      return NextResponse.json(
        { success: false, error: msg, code: "PROXY_ERROR" },
        { status: 502 },
      );
    }
  }

  // JSON body — existing path
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

  try {
    const res = await proxyToDaemon("/create-auction", daemonBody);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Auction creation request failed";
    console.error("[api/create-auction]", msg);
    return NextResponse.json(
      { success: false, error: msg, code: "PROXY_ERROR" },
      { status: 502 },
    );
  }
}
