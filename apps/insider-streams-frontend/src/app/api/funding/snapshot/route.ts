import { NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  getFundingServerSnapshot,
} from "@/lib/funding/server";
import type { FundingSnapshotResponse } from "@/lib/funding/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { error: "A valid wallet address is required." },
      { status: 400 },
    );
  }

  try {
    const data = await getFundingServerSnapshot(address);

    return NextResponse.json<FundingSnapshotResponse>({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load funding snapshot.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
