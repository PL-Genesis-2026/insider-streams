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

  const res = await proxyToDaemon("/admin-expire", body);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: `Daemon returned non-JSON (${res.status})` },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }
}
