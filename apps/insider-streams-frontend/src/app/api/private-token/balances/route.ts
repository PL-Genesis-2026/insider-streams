import { NextResponse } from "next/server";
import { z } from "zod";
import { proxyPrivateTokenRequest } from "@/lib/private-token/server";

const balancesPayloadSchema = z.object({
  account: z.string().min(1),
  timestamp: z.number().int().positive(),
  auth: z.string().min(1),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsedPayload = balancesPayloadSchema.safeParse(json);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: "A valid balances payload is required." },
      { status: 400 },
    );
  }

  try {
    const upstreamResponse = await proxyPrivateTokenRequest(
      "/balances",
      JSON.stringify(parsedPayload.data),
    );

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": upstreamResponse.contentType,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to query private balances.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
