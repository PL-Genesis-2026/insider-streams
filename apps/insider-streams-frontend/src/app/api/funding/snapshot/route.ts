import { NextResponse } from "next/server";
import {
  getFundingServerSnapshot,
} from "@/lib/funding/server";
import type { FundingSnapshotResponse } from "@/lib/funding/types";
import { verifyPrivateDataRequest } from "@/lib/signed-request";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const verified = await verifyPrivateDataRequest<Record<string, never>>(body);

  if (!verified.ok) {
    return verified.response;
  }

  try {
    const data = await getFundingServerSnapshot(verified.payload.userAddress);

    return NextResponse.json<FundingSnapshotResponse>({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load funding snapshot.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
