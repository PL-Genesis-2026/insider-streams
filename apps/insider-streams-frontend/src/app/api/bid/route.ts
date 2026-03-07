import { NextResponse } from "next/server";
import { z } from "zod";
import { recoverTypedDataAddress, type Address } from "viem";
import {
  secretMarketplaceAbi,
  SECRET_MARKETPLACE_ADDRESS,
} from "@private-streams/common";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getPublicClient, getAdminWalletClient } from "@/lib/viem";

const SIGNATURE_MAX_AGE_SECONDS = 60;

const EIP712_DOMAIN = {
  name: "InsiderStreams",
  version: "1",
  chainId: 11155111,
} as const;

const EIP712_TYPES = {
  PlaceBid: [
    { name: "auctionId", type: "string" },
    { name: "amount",    type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
} as const;

const bidRequestSchema = z.object({
  auctionId: z.string().min(1, "auctionId is required"),
  amount: z
    .string()
    .min(1, "amount is required")
    .refine((v) => {
      try {
        return BigInt(v) > BigInt(0);
      } catch {
        return false;
      }
    }, "amount must be a positive integer string"),
  timestamp: z.number().int("timestamp must be an integer"),
  signature: z
    .string()
    .regex(/^0x[a-fA-F0-9]+$/, "signature must be a hex string"),
});

export async function POST(request: Request) {
  // 1. Validate request
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = bidRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues.map((e: { message: string }) => e.message).join("; "),
        code: "VALIDATION_ERROR",
      },
      { status: 400 },
    );
  }

  const { auctionId, amount, timestamp, signature } = parsed.data;

  // 2. Reject stale signatures
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_MAX_AGE_SECONDS) {
    return NextResponse.json(
      { error: "Signature expired or timestamp too far in the future", code: "STALE_SIGNATURE" },
      { status: 400 },
    );
  }

  // 3. Recover bidder address from EIP-712 signature
  let bidderAddr: string;
  try {
    const recovered = await recoverTypedDataAddress({
      domain: EIP712_DOMAIN,
      types: EIP712_TYPES,
      primaryType: "PlaceBid",
      message: { auctionId, amount, timestamp: BigInt(timestamp) },
      signature: signature as `0x${string}`,
    });
    bidderAddr = recovered.toLowerCase();
  } catch {
    return NextResponse.json(
      { error: "Invalid signature", code: "INVALID_SIGNATURE" },
      { status: 400 },
    );
  }

  const bidAmount = BigInt(amount);
  const marketplaceAddress = SECRET_MARKETPLACE_ADDRESS as Address;

  const publicClient = getPublicClient();
  const supabase = getSupabaseServiceClient();

  // 4. Check auction exists and is open
  let auctionStatus: number;
  try {
    const auctionData = await publicClient.readContract({
      address: marketplaceAddress,
      abi: secretMarketplaceAbi,
      functionName: "getAuction",
      args: [BigInt(auctionId)],
    });
    // Non-existent auctions return default struct with endTime=0
    if (auctionData.endTime === BigInt(0)) {
      return NextResponse.json(
        { error: "Auction does not exist", code: "AUCTION_NOT_FOUND" },
        { status: 400 },
      );
    }
    auctionStatus = auctionData.status;
  } catch {
    return NextResponse.json(
      { error: "Failed to read auction from contract", code: "CONTRACT_ERROR" },
      { status: 500 },
    );
  }

  if (auctionStatus !== 0) {
    return NextResponse.json(
      { error: "Auction is not open", code: "AUCTION_NOT_OPEN" },
      { status: 400 },
    );
  }

  // 5. Check balance
  const { data: balanceRow, error: balError } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAddr)
    .single();

  if (balError || !balanceRow) {
    return NextResponse.json(
      { error: "No balance found for this address", code: "NO_BALANCE" },
      { status: 400 },
    );
  }

  const availableBalance = BigInt(balanceRow.available_balance!);
  if (availableBalance < bidAmount) {
    return NextResponse.json(
      { error: "Insufficient available balance", code: "INSUFFICIENT_BALANCE" },
      { status: 400 },
    );
  }

  // 6. Check active bid
  const { data: activeBids, error: activeBidError } = await supabase
    .from("private_bids")
    .select("*")
    .eq("auction_id", auctionId)
    .eq("status", "active");

  if (activeBidError) {
    return NextResponse.json(
      { error: "Failed to query active bids", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const activeBid = activeBids && activeBids.length > 0 ? activeBids[0] : null;

  if (activeBid) {
    if (activeBid.bidder_address === bidderAddr) {
      return NextResponse.json(
        { error: "Already the highest bidder", code: "ALREADY_HIGHEST" },
        { status: 400 },
      );
    }

    if (bidAmount <= BigInt(activeBid.amount)) {
      return NextResponse.json(
        { error: "Bid must be strictly greater than current bid", code: "BID_TOO_LOW" },
        { status: 400 },
      );
    }
  }

  // 7. Call placeBid on-chain
  let txHash: `0x${string}`;
  try {
    const walletClient = getAdminWalletClient();
    txHash = await walletClient.writeContract({
      address: marketplaceAddress,
      abi: secretMarketplaceAbi,
      functionName: "placeBid",
      args: [BigInt(auctionId), bidAmount],
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `On-chain placeBid failed: ${message}`, code: "TX_FAILED" },
      { status: 500 },
    );
  }

  // 8. Update database
  let bidId: string | undefined;
  try {
    // 8a. If there was an active bid, mark it as outbid
    if (activeBid) {
      const { error: outbidError } = await supabase
        .from("private_bids")
        .update({ status: "outbid", outbid_at: new Date().toISOString() })
        .eq("id", activeBid.id)
        .eq("status", "active");

      if (outbidError) {
        console.error("Failed to mark previous bid as outbid:", outbidError);
      }
    }

    // 8b. Insert new active bid
    const { data: newBid, error: insertError } = await supabase
      .from("private_bids")
      .insert({
        auction_id: auctionId,
        bidder_address: bidderAddr,
        amount: amount,
        status: "active",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert new bid:", insertError);
      // On-chain tx succeeded, return tx hash anyway
      return NextResponse.json({
        success: true,
        bidId: "unknown",
        txHash,
      });
    }

    bidId = newBid.id;
  } catch (dbErr) {
    console.error("Database operation failed after successful on-chain tx:", dbErr);
    // On-chain state is source of truth — still return success with tx hash
    return NextResponse.json({
      success: true,
      bidId: "unknown",
      txHash,
    });
  }

  // 9. Return success
  return NextResponse.json({
    success: true,
    bidId: bidId!,
    txHash,
  });
}
