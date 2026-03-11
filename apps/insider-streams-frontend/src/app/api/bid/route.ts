import { NextResponse } from "next/server";
import { proxyToDaemon } from "@/lib/daemon-client";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const res = await proxyToDaemon("/bid", body);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
