import { NextResponse } from "next/server";
import { proxyToDaemon } from "@/lib/daemon-client";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const res = await proxyToDaemon("/admin-expire", body);
  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}
