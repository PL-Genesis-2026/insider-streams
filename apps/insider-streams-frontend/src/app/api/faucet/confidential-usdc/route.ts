import { NextResponse } from "next/server";
import { proxyToDaemon } from "@/lib/daemon-client";

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const res = await proxyToDaemon("/faucet", body);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/faucet] proxy error:", msg);
    return NextResponse.json({ error: `Daemon unreachable: ${msg}` }, { status: 502 });
  }
}
