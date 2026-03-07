/**
 * Bid API client — shared signing + calling logic.
 *
 * Used by the bid-workflow e2e test (and importable by any future frontend
 * code that needs to call POST /api/bid).
 *
 * Signing convention matches verifySignedRequest in the API:
 *   message = fast-json-stable-stringify({ auctionId, amount, timestamp })
 *   signature = personal_sign(message)
 */

import stringify from "fast-json-stable-stringify";
import type { LocalAccount } from "viem";

export interface BidSuccess {
  ok: true;
  bidId: string;
  txHash: string;
}

export interface BidFailure {
  ok: false;
  status: number;
  error: string;
  code: string;
}

export type BidResult = BidSuccess | BidFailure;

export async function callBidApi(
  baseUrl: string,
  signer: LocalAccount,
  opts: { auctionId: bigint; amount: bigint },
): Promise<BidResult> {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = {
    auctionId: opts.auctionId.toString(),
    amount: opts.amount.toString(),
    timestamp,
  };

  const message = stringify(payload);
  const signature = await signer.signMessage({ message });

  const resp = await fetch(`${baseUrl}/api/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, signature }),
  });

  const data = (await resp.json()) as Record<string, unknown>;

  if (resp.ok) {
    return { ok: true, bidId: data.bidId as string, txHash: data.txHash as string };
  }
  return {
    ok: false,
    status: resp.status,
    error: data.error as string,
    code: data.code as string,
  };
}
