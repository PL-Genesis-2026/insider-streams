/**
 * Core bid placement logic — shared between the Next.js API route and E2E scripts.
 *
 * Both entrypoints pass their own Supabase + viem clients; this function contains
 * all validation, on-chain interaction, and database writes.
 */

import type { Address, Hex, PublicClient } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fheSecretMarketplaceAbi } from "./__generated__/contract-types";
import type { Database } from "./__generated__/supabase-types";

// Minimal structural type — compatible with any viem WalletClient that has an account
interface BidWalletClient {
  writeContract(args: {
    address: Address;
    abi: typeof fheSecretMarketplaceAbi;
    functionName: "placeBid";
    args: [bigint, bigint];
  }): Promise<Hex>;
}

export interface BidSuccess {
  ok: true;
  bidId: string;
  txHash: Hex;
  /** Set when the on-chain tx succeeded but a subsequent DB write failed. */
  warning?: string;
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

  // 1. Check auction exists and is open; capture currentBid as source of truth
  let auctionStatus: number;
  let contractCurrentBid: bigint;
  let auctionSellerId: string;
  try {
    const auctionIdBigInt = BigInt(auctionId);
    const chainId = await publicClient.getChainId();
    const auctionTuple = await publicClient.readContract({
      address: marketplaceAddress,
      abi: fheSecretMarketplaceAbi,
      functionName: "getAuction",
      args: [auctionIdBigInt],
    });
    // FHE getAuction returns: [sellerId, endTime, currentBid(encrypted), currentBidderId, eventId, eventTitle, status, reputationResolved, secretDataCid, currentBidPlaintext]
    const [sellerId, endTime, , , , , status, , , currentBidPlaintext] = auctionTuple;
    if (endTime === BigInt(0)) {
      const sepoliaChainId = 11155111;
      const rpcMismatchHint =
        chainId !== sepoliaChainId
          ? ` RPC reports chain ID ${chainId}; Sepolia is ${sepoliaChainId}. Ensure RPC_URL points to Ethereum Sepolia.`
          : ` The subgraph may index an old contract deployment. Redeploy the subgraph: ./scripts/deploy-subgraph.sh --address ${marketplaceAddress}`;
      return {
        ok: false,
        status: 400,
        error: `Auction does not exist on-chain.${rpcMismatchHint}`,
        code: "AUCTION_NOT_FOUND",
      };
    }
    auctionStatus = status;
    contractCurrentBid = BigInt(currentBidPlaintext);
    auctionSellerId = sellerId;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 500,
      error: `Failed to read auction from contract: ${errMsg}`,
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

  // 2. Ensure bidder is not the seller of this auction
  const { data: sellerRow } = await supabase
    .from("sellers")
    .select("address")
    .eq("id", auctionSellerId)
    .single();

  if (sellerRow && sellerRow.address.toLowerCase() === bidderAddr.toLowerCase()) {
    return {
      ok: false,
      status: 400,
      error: "Sellers cannot bid on their own auctions",
      code: "SELF_BID_NOT_ALLOWED",
    };
  }

  // 4. Check bid amount against contract's currentBid (source of truth)
  if (bidAmount <= contractCurrentBid) {
    return {
      ok: false,
      status: 400,
      error: "Bid must be strictly greater than current bid",
      code: "BID_TOO_LOW",
    };
  }

  // 5. Check Supabase balance
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

  // 4. Fetch the active Supabase bid row — needed to mark as outbid and check ALREADY_HIGHEST
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

  if (activeBid?.bidder_address === bidderAddr) {
    return {
      ok: false,
      status: 400,
      error: "Already the highest bidder",
      code: "ALREADY_HIGHEST",
    };
  }

  // 4. Submit placeBid on-chain (admin wallet, bidder identity tracked in DB only)
  let txHash: Hex;
  try {
    txHash = await walletClient.writeContract({
      address: marketplaceAddress,
      abi: fheSecretMarketplaceAbi,
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
      // On-chain tx succeeded — bid is placed. Surface the DB error so callers can alert/retry.
      return { ok: true, bidId: "unknown", txHash, warning: `DB insert failed: ${insertError?.message ?? "no data returned"}` };
    }

    return { ok: true, bidId: newBid.id, txHash };
  } catch (dbErr) {
    const message = dbErr instanceof Error ? dbErr.message : String(dbErr);
    return { ok: true, bidId: "unknown", txHash, warning: `DB write failed: ${message}` };
  }
}
