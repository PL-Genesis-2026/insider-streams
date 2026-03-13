import { NextResponse } from "next/server";
import { proxyToDaemon } from "@/lib/daemon-client";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const res = await proxyToDaemon("/balance", body);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Balance request failed";
    console.error("[api/funding/snapshot]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
