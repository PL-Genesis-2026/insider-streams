import { NextResponse } from "next/server";
import { z } from "zod";
import { erc20Abi } from "viem";
import { secretMarketplaceAbi } from "@private-streams/common";
import { verifySignedRequest } from "@/lib/signed-request";
import { getAdminWalletClient, getPublicClient } from "@/lib/viem";
import { SECRET_MARKETPLACE_ADDRESS } from "@/lib/contract-addresses";

const requestSchema = z.object({
  amount: z
    .string()
    .min(1, "amount is required")
    .refine((value) => {
      try {
        return BigInt(value) > BigInt(0);
      } catch {
        return false;
      }
    }, "amount must be a positive integer string"),
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

  try {
    const publicClient = getPublicClient();
    const adminWallet = getAdminWalletClient();
    const paymentToken = await publicClient.readContract({
      address: SECRET_MARKETPLACE_ADDRESS,
      abi: secretMarketplaceAbi,
      functionName: "paymentToken",
    });
    const allowance = await publicClient.readContract({
      address: paymentToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [adminWallet.account.address, SECRET_MARKETPLACE_ADDRESS],
    });

    const amount = BigInt(parsed.data.amount);

    return NextResponse.json({
      approved: allowance >= amount,
      allowance: allowance.toString(),
      spender: SECRET_MARKETPLACE_ADDRESS,
      owner: adminWallet.account.address,
      token: paymentToken,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown contract read failure";
    return NextResponse.json(
      { error: `Failed to check bid approval: ${message}`, code: "CONTRACT_ERROR" },
      { status: 500 },
    );
  }
}
