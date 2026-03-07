import { NextResponse } from "next/server";
import {
  SUBGRAPH_REQUEST_HEADERS,
  SUBGRAPH_URL,
} from "@/lib/subgraph-config";

export async function POST(request: Request) {
  try {
    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: {
        "content-type":
          request.headers.get("content-type") ?? "application/json",
        ...SUBGRAPH_REQUEST_HEADERS,
      },
      body: await request.text(),
      cache: "no-store",
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to query subgraph.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
