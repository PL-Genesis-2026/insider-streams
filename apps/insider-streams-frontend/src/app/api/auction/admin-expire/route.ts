import { NextResponse } from "next/server";
import { z } from "zod";
import { secretMarketplaceAbi } from "@private-streams/common";
import { verifySignedRequest } from "@/lib/signed-request";
import { SECRET_MARKETPLACE_ADDRESS } from "@/lib/contract-addresses";
import { getOwnerAddress } from "@/lib/admin";
import { getAdminWalletClient, getPublicClient } from "@/lib/viem";

const requestSchema = z.object({
  auctionId: z
    .string()
    .min(1, "auctionId is required")
    .refine((value) => /^\d+$/.test(value), "auctionId must be a uint string"),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const verified = await verifySignedRequest(body);
  if (!verified.ok) return verified.response;

  const parsed = requestSchema.safeParse(verified.payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues.map((issue) => issue.message).join("; "),
        code: "VALIDATION_ERROR",
      },
      { status: 400 },
    );
  }

  const ownerAddress = getOwnerAddress();
  if (!ownerAddress) {
    return NextResponse.json(
      { error: "Server owner wallet is not configured", code: "OWNER_NOT_CONFIGURED" },
      { status: 500 },
    );
  }

  if (verified.payload.userAddress !== ownerAddress) {
    return NextResponse.json(
      { error: "Only the marketplace admin can expire auctions", code: "UNAUTHORIZED" },
      { status: 403 },
    );
  }

  try {
    const walletClient = getAdminWalletClient();
    const publicClient = getPublicClient();
    const hash = await walletClient.writeContract({
      address: SECRET_MARKETPLACE_ADDRESS,
      abi: secretMarketplaceAbi,
      functionName: "adminExpireAuction",
      args: [BigInt(parsed.data.auctionId)],
    });

    await publicClient.waitForTransactionReceipt({ hash });

    return NextResponse.json({ success: true, txHash: hash });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown contract write failure";

    return NextResponse.json(
      { error: `Failed to expire auction: ${message}`, code: "TX_FAILED" },
      { status: 500 },
    );
  }
}
