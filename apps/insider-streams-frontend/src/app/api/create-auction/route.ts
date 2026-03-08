import { NextResponse } from "next/server";
import { parseEventLogs, recoverTypedDataAddress, type Address } from "viem";
import {
  secretMarketplaceAbi,
  examplePredictionMarketAbi,
} from "@private-streams/common";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getPublicClient, getAdminWalletClient } from "@/lib/viem";
import {
  CREATE_AUCTION_DURATION_SECONDS,
  CREATE_AUCTION_EIP712_DOMAIN,
  CREATE_AUCTION_EIP712_TYPES,
  createAuctionRequestSchema,
  type CreateAuctionErrorResponse,
  type CreateAuctionSuccessResponse,
} from "@/lib/create-auction/shared";
import { generateSellerId } from "@/lib/seller/generate-seller-id";
import {
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  SECRET_MARKETPLACE_ADDRESS,
} from "@/lib/contract-addresses";

const SIGNATURE_MAX_AGE_SECONDS = 120;

function errorResponse(
  body: CreateAuctionErrorResponse,
  status: number,
): NextResponse<CreateAuctionErrorResponse> {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = createAuctionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      {
        error: parsed.error.issues.map((issue) => issue.message).join("; "),
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  const { eventId, privateLeg, secretPayload, duration, timestamp, signature } =
    parsed.data;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_MAX_AGE_SECONDS) {
    return errorResponse(
      {
        error: "Signature expired or timestamp too far in the future",
        code: "STALE_SIGNATURE",
      },
      400,
    );
  }

  let sellerAddress: string;
  try {
    const recovered = await recoverTypedDataAddress({
      domain: CREATE_AUCTION_EIP712_DOMAIN,
      types: CREATE_AUCTION_EIP712_TYPES,
      primaryType: "CreateAuction",
      message: {
        eventId,
        privateLeg,
        duration,
        timestamp: BigInt(timestamp),
      },
      signature: signature as `0x${string}`,
    });
    sellerAddress = recovered.toLowerCase();
  } catch {
    return errorResponse(
      { error: "Invalid signature", code: "INVALID_SIGNATURE" },
      400,
    );
  }

  const publicClient = getPublicClient();
  const supabase = getSupabaseServiceClient();
  const marketplaceAddress = SECRET_MARKETPLACE_ADDRESS as Address;
  const predictionMarketAddress = EXAMPLE_PREDICTION_MARKET_ADDRESS as Address;

  const externalEventId = BigInt(eventId);

  // Read event from prediction market to validate it exists / is open
  let eventTitle: string;
  try {
    const nextEventId = await publicClient.readContract({
      address: predictionMarketAddress,
      abi: examplePredictionMarketAbi,
      functionName: "nextEventId",
    });

    if (externalEventId >= nextEventId) {
      return errorResponse(
        { error: "Prediction market event does not exist", code: "EVENT_NOT_FOUND" },
        400,
      );
    }

    const pmEvent = await publicClient.readContract({
      address: predictionMarketAddress,
      abi: examplePredictionMarketAbi,
      functionName: "getEvent",
      args: [externalEventId],
    });

    if (pmEvent.status !== 0) {
      return errorResponse(
        { error: "Prediction market event is not open", code: "EVENT_NOT_OPEN" },
        400,
      );
    }

    const eventCloseSeconds = Number(pmEvent.eventClose);
    if (eventCloseSeconds <= nowSeconds) {
      return errorResponse(
        { error: "Prediction market event has expired", code: "EVENT_EXPIRED" },
        400,
      );
    }

    eventTitle = pmEvent.question;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown contract read failure";

    return errorResponse(
      {
        error: `Failed to read prediction market event: ${message}`,
        code: "CONTRACT_ERROR",
      },
      500,
    );
  }

  // Look up or create seller
  const { data: existingSeller, error: existingSellerError } = await supabase
    .from("sellers")
    .select("id")
    .eq("address", sellerAddress)
    .maybeSingle();

  if (existingSellerError) {
    return errorResponse(
      {
        error: `Failed to look up seller profile: ${existingSellerError.message}`,
        code: "DB_ERROR",
      },
      500,
    );
  }

  let sellerId: string | undefined;

  if (existingSeller) {
    sellerId = existingSeller.id;
  } else {
    // Generate a unique Docker-style name, retry on collision
    const MAX_RETRIES = 5;
    let inserted = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const candidateId = generateSellerId();
      const { error: insertError } = await supabase
        .from("sellers")
        .insert({ id: candidateId, address: sellerAddress });

      if (!insertError) {
        sellerId = candidateId;
        inserted = true;
        break;
      }

      // If the error is a unique constraint violation on id, retry with a new name
      if (insertError.code === "23505" && insertError.message.includes("sellers_pkey")) {
        continue;
      }

      // Any other error is unexpected
      return errorResponse(
        { error: `Failed to create seller profile: ${insertError.message}`, code: "DB_ERROR" },
        500,
      );
    }

    if (!inserted) {
      return errorResponse(
        { error: "Failed to generate unique seller ID after retries", code: "ID_COLLISION" },
        500,
      );
    }
  }

  if (!sellerId) {
    return errorResponse(
      {
        error: "Seller identity resolution failed before auction creation.",
        code: "SELLER_ID_MISSING",
      },
      500,
    );
  }

  // Compute auction end time
  const durationSeconds = CREATE_AUCTION_DURATION_SECONDS[duration];
  const endTime = BigInt(nowSeconds + durationSeconds);

  // Call createAuction on-chain
  let txHash: `0x${string}`;
  let auctionId: string;
  try {
    const walletClient = getAdminWalletClient();
    txHash = await walletClient.writeContract({
      address: marketplaceAddress,
      abi: secretMarketplaceAbi,
      functionName: "createAuction",
      args: [sellerId, externalEventId, eventTitle, endTime],
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    const parsed712Logs = parseEventLogs({
      abi: secretMarketplaceAbi,
      logs: receipt.logs,
      eventName: "AuctionCreated",
    });

    if (parsed712Logs.length === 1 && parsed712Logs[0]?.args.auctionId !== undefined) {
      auctionId = parsed712Logs[0].args.auctionId.toString();
    } else {
      return errorResponse(
        {
          error:
            "Auction was created on-chain but the receipt did not contain a parseable AuctionCreated event.",
          code: "AUCTION_EVENT_MISSING",
          txHash,
        },
        500,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(
      { error: `On-chain createAuction failed: ${message}`, code: "TX_FAILED" },
      500,
    );
  }

  // Store the secret data in Supabase (upsert so a retry after on-chain success doesn't double-fault)
  const { error: secretError } = await supabase.from("secrets").upsert(
    {
      auction_id: auctionId,
      secret_data: secretPayload,
      seller_id: sellerId,
      event_data: {
        marketplace: "ExamplePredictionMarket",
        event: eventTitle,
        marketId: Number(externalEventId),
        outcome: privateLeg,
      },
    },
    { onConflict: "auction_id" },
  );

  if (secretError) {
    return errorResponse(
      {
        error: `Auction was created on-chain but storing the secret payload failed: ${secretError.message}`,
        code: "SECRET_STORAGE_FAILED",
        auctionId,
        txHash,
      },
      500,
    );
  }

  const response: CreateAuctionSuccessResponse = {
    success: true,
    auctionId,
    sellerId,
    txHash,
  };

  return NextResponse.json(response);
}
