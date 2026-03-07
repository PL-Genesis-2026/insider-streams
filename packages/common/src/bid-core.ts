/**
 * Core bid placement logic — shared between the Next.js API route and E2E scripts.
 *
 * Both entrypoints pass their own Supabase + viem clients; this function contains
 * all validation, on-chain interaction, and database writes.
 */

import type { Address, Hex, PublicClient } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import { secretMarketplaceAbi } from "./__generated__/contract-types";
import type { Database } from "./__generated__/supabase-types";

// Minimal structural type — compatible with any viem WalletClient that has an account
interface BidWalletClient {
  writeContract(args: {
    address: Address;
    abi: typeof secretMarketplaceAbi;
    functionName: "placeBid";
    args: [bigint, bigint];
  }): Promise<Hex>;
}

export interface BidSuccess {
  ok: true;
  bidId: string;
  txHash: Hex;
}

export interface BidFailure {
  ok: false;
  /** Suggested HTTP status code (useful for API callers). */
  status: number;
  error: string;
  code: string;
}

export type BidResult = BidSuccess | BidFailure;

export interface ExecuteBidDeps {
  supabase: SupabaseClient<Database>;
  publicClient: PublicClient;
  /** Admin/platform wallet client used to submit the on-chain placeBid tx. */
  walletClient: BidWalletClient;
  marketplaceAddress: Address;
}

export interface ExecuteBidParams {
  /** Lowercased bidder EOA address — used for Supabase records and balance checks. */
  bidderAddr: string;
  auctionId: string;
  amount: string;
}

export async function executeBid(
  deps: ExecuteBidDeps,
  params: ExecuteBidParams,
): Promise<BidResult> {
  const { supabase, publicClient, walletClient, marketplaceAddress } = deps;
  const { bidderAddr, auctionId, amount } = params;
  const bidAmount = BigInt(amount);

  // 1. Check auction exists and is open
  let auctionStatus: number;
  try {
    const auctionData = await publicClient.readContract({
      address: marketplaceAddress,
      abi: secretMarketplaceAbi,
      functionName: "getAuction",
      args: [BigInt(auctionId)],
    });
    if (auctionData.endTime === BigInt(0)) {
      return {
        ok: false,
        status: 400,
        error: "Auction does not exist",
        code: "AUCTION_NOT_FOUND",
      };
    }
    auctionStatus = auctionData.status;
  } catch {
    return {
      ok: false,
      status: 500,
      error: "Failed to read auction from contract",
      code: "CONTRACT_ERROR",
    };
  }

  if (auctionStatus !== 0) {
    return {
      ok: false,
      status: 400,
      error: "Auction is not open",
      code: "AUCTION_NOT_OPEN",
    };
  }

  // 2. Check Supabase balance
  const { data: balanceRow, error: balError } = await supabase
    .from("balances")
    .select("*")
    .eq("user_address", bidderAddr)
    .single();

  if (balError || !balanceRow) {
    return {
      ok: false,
      status: 400,
      error: "No balance found for this address",
      code: "NO_BALANCE",
    };
  }

  const availableBalance = BigInt(balanceRow.available_balance!);
  if (availableBalance < bidAmount) {
    return {
      ok: false,
      status: 400,
      error: "Insufficient available balance",
      code: "INSUFFICIENT_BALANCE",
    };
  }

  // 3. Check existing active bid
  const { data: activeBids, error: activeBidError } = await supabase
    .from("private_bids")
    .select("*")
    .eq("auction_id", auctionId)
    .eq("status", "active");

  if (activeBidError) {
    return {
      ok: false,
      status: 500,
      error: "Failed to query active bids",
      code: "DB_ERROR",
    };
  }

  const activeBid = activeBids && activeBids.length > 0 ? activeBids[0] : null;

  if (activeBid) {
    if (activeBid.bidder_address === bidderAddr) {
      return {
        ok: false,
        status: 400,
        error: "Already the highest bidder",
        code: "ALREADY_HIGHEST",
      };
    }
    if (bidAmount <= BigInt(activeBid.amount)) {
      return {
        ok: false,
        status: 400,
        error: "Bid must be strictly greater than current bid",
        code: "BID_TOO_LOW",
      };
    }
  }

  // 4. Submit placeBid on-chain (admin wallet, bidder identity tracked in DB only)
  let txHash: Hex;
  try {
    txHash = await walletClient.writeContract({
      address: marketplaceAddress,
      abi: secretMarketplaceAbi,
      functionName: "placeBid",
      args: [BigInt(auctionId), bidAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 500,
      error: `On-chain placeBid failed: ${message}`,
      code: "TX_FAILED",
    };
  }

  // 5. Write to Supabase
  try {
    if (activeBid) {
      await supabase
        .from("private_bids")
        .update({ status: "outbid", outbid_at: new Date().toISOString() })
        .eq("id", activeBid.id)
        .eq("status", "active");
    }

    const { data: newBid, error: insertError } = await supabase
      .from("private_bids")
      .insert({
        auction_id: auctionId,
        bidder_address: bidderAddr,
        amount,
        status: "active",
      })
      .select()
      .single();

    if (insertError || !newBid) {
      // On-chain tx succeeded — return success even if DB write partially failed
      return { ok: true, bidId: "unknown", txHash };
    }

    return { ok: true, bidId: newBid.id, txHash };
  } catch {
    return { ok: true, bidId: "unknown", txHash };
  }
}
