import { NextResponse } from "next/server";
import { proxyToDaemon } from "@/lib/daemon-client";

export const maxDuration = 90;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const res = await proxyToDaemon("/withdraw", body);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
