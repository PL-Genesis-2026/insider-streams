import { NextResponse } from "next/server";
import {
  confidentialUsdcAbi,
  PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
} from "@private-streams/common";
import {
  BaseError,
  erc20Abi,
  getAddress,
  isAddressEqual,
  type Address,
} from "viem";
import { z } from "zod";
import {
  CONFIDENTIAL_USDC_FAUCET_ACTION,
  CONFIDENTIAL_USDC_FAUCET_AMOUNT_BASE_UNITS,
  CONFIDENTIAL_USDC_FAUCET_AMOUNT_DISPLAY,
  type ConfidentialUsdcFaucetErrorResponse,
  type ConfidentialUsdcFaucetSuccessResponse,
} from "@/lib/faucet/shared";
import { verifySignedRequest } from "@/lib/signed-request";
import { getAdminWalletClient, getPublicClient } from "@/lib/viem";

const faucetRequestSchema = z.object({
  action: z.literal(CONFIDENTIAL_USDC_FAUCET_ACTION),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  timestamp: z.number().int(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

function errorResponse(
  body: ConfidentialUsdcFaucetErrorResponse,
  status: number,
) {
  return NextResponse.json(body, { status });
}

function getErrorMessage(error: unknown) {
  if (error instanceof BaseError) {
    return error.shortMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown faucet error.";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      {
        success: false,
        code: "INVALID_BODY",
        error: "Invalid JSON body.",
      },
      400,
    );
  }

  const parsedBody = faucetRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return errorResponse(
      {
        success: false,
        code: "VALIDATION_ERROR",
        error: parsedBody.error.issues.map((issue) => issue.message).join("; "),
      },
      400,
    );
  }

  const verified = await verifySignedRequest<{
    action: typeof CONFIDENTIAL_USDC_FAUCET_ACTION;
    address: string;
    timestamp: number;
  }>(body);
  if (!verified.ok) {
    return verified.response;
  }

  const requestedAddress = getAddress(parsedBody.data.address);
  const signerAddress = getAddress(verified.payload.userAddress);

  if (!isAddressEqual(requestedAddress, signerAddress)) {
    return errorResponse(
      {
        success: false,
        code: "ADDRESS_MISMATCH",
        error:
          "Faucet requests must be signed by the same wallet receiving the mint.",
      },
      403,
    );
  }

  const publicClient = getPublicClient();
  const walletClient = getAdminWalletClient();
  const tokenAddress = PRIVATE_CONFIDENTIAL_USDC_ADDRESS as Address;

  try {
    const txHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: confidentialUsdcAbi,
      functionName: "mint",
      args: [requestedAddress, CONFIDENTIAL_USDC_FAUCET_AMOUNT_BASE_UNITS],
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const balanceAfter = await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [requestedAddress],
    });

    const response: ConfidentialUsdcFaucetSuccessResponse = {
      success: true,
      address: requestedAddress,
      amountBaseUnits: CONFIDENTIAL_USDC_FAUCET_AMOUNT_BASE_UNITS.toString(),
      amountDisplay: CONFIDENTIAL_USDC_FAUCET_AMOUNT_DISPLAY,
      balanceAfter: balanceAfter.toString(),
      txHash,
    };

    return NextResponse.json(response);
  } catch (error) {
    return errorResponse(
      {
        success: false,
        code: "FAUCET_MINT_FAILED",
        error: getErrorMessage(error),
      },
      500,
    );
  }
}
