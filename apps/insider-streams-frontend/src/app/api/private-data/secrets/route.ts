import { NextResponse } from "next/server";
import { proxyToDaemon } from "@/lib/daemon-client";
import type { PrivateSecretState } from "@/lib/private-data/types";

type DaemonSecret = {
  auctionId: number;
  secretDataCid: string;
  secretDataKey: string | null;
  secretData: string | null;
  eventData: string | null;
  hasAccess: boolean;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { auctionIds: requestedIds, signature, timestamp } = body as {
    auctionIds?: string[];
    signature?: string;
    timestamp?: number;
  };

  // Proxy only { signature, timestamp, auctionIds } to the daemon.
  // The client signs only { timestamp }, so extra fields in the body would
  // cause verifySignedRequest to reconstruct a different message and recover
  // the wrong address. We re-add auctionIds as the daemon expects it.
  const res = await proxyToDaemon("/secrets", { signature, timestamp, auctionIds: requestedIds });
  const json = await res.json();

  if (!res.ok) {
    return NextResponse.json(json, { status: res.status });
  }

  // Transform daemon response into Record<auctionId, PrivateSecretState>
  // matching the shape the frontend expects (same as original Supabase version).
  const secrets: DaemonSecret[] = json.secrets ?? [];
  const data: Record<string, PrivateSecretState> = {};

  for (const s of secrets) {
    const key = String(s.auctionId);
    if (s.hasAccess) {
      let eventData = null;
      if (s.eventData) {
        try {
          eventData = JSON.parse(s.eventData);
        } catch {
          // malformed event_data — ignore
        }
      }
      data[key] = {
        kind: "accessible",
        secret_data: s.secretData ?? s.secretDataKey ?? "",
        event_data: eventData,
      };
    } else {
      data[key] = { kind: "forbidden" };
    }
  }

  // Any requested auction IDs not returned by daemon → not_found
  if (Array.isArray(requestedIds)) {
    for (const id of requestedIds) {
      if (!(String(id) in data)) {
        data[String(id)] = { kind: "not_found" };
      }
    }
  }

  return NextResponse.json({ data }, { status: 200 });
}
