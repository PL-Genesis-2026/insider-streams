import { NextResponse } from "next/server";
import { proxyToDaemon } from "@/lib/daemon-client";
import type { PrivateSellerRecord } from "@/lib/private-data/types";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const res = await proxyToDaemon("/seller", body);
  const json = await res.json();

  if (!res.ok) {
    return NextResponse.json(json, { status: res.status });
  }

  // Transform daemon's { isSeller, userId } into { data: PrivateSellerRecord | null }
  const data: PrivateSellerRecord | null = json.isSeller
    ? { id: json.userId, address: json.userId }
    : null;

  return NextResponse.json({ data }, { status: 200 });
}
