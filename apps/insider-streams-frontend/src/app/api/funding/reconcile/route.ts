import { NextResponse } from "next/server";
import { reconcileFundingServerSnapshot } from "@/lib/funding/server";
import type { FundingReconcileResponse } from "@/lib/funding/types";
import { verifyPrivateDataRequest } from "@/lib/signed-request";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const verified = await verifyPrivateDataRequest<Record<string, never>>(body);

  if (!verified.ok) {
    return verified.response;
  }

  try {
    const { reconciledCount, scannedCount, ...data } =
      await reconcileFundingServerSnapshot(verified.payload.userAddress);

    return NextResponse.json<FundingReconcileResponse>({
      data,
      reconciledCount,
      scannedCount,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reconcile funding.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
