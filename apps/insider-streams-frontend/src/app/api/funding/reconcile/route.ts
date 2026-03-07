import { NextResponse } from "next/server";
import { z } from "zod";
import { isAddress } from "viem";
import { reconcileFundingServerSnapshot } from "@/lib/funding/server";
import type { FundingReconcileResponse } from "@/lib/funding/types";

const reconcilePayloadSchema = z.object({
  address: z.string().min(1),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsedPayload = reconcilePayloadSchema.safeParse(json);

  if (!parsedPayload.success || !isAddress(parsedPayload.data.address)) {
    return NextResponse.json(
      { error: "A valid wallet address is required." },
      { status: 400 },
    );
  }

  try {
    const { reconciledCount, scannedCount, ...data } =
      await reconcileFundingServerSnapshot(parsedPayload.data.address);

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
