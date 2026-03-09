type BidWithAmountAndHash = {
  amountUsdc: number;
  transactionHash: string;
};

export function findOwnBidTransactionHash(
  bids: BidWithAmountAndHash[],
  ownBidAmountUsdc?: number,
): string | undefined {
  if (ownBidAmountUsdc === undefined) {
    return undefined;
  }

  return bids.find((bid) => bid.amountUsdc === ownBidAmountUsdc)?.transactionHash;
}
