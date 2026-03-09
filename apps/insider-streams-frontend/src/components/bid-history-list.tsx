"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ExternalLink, Trophy, User } from "lucide-react";
import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { formatUnits } from "viem";
import { findOwnBidTransactionHash } from "@/lib/private-data/find-own-bid-transaction-hash";
import { usePrivateData } from "@/lib/private-data/use-private-data";
import type { AuctionDetailBid } from "@/lib/auction-detail";
import { cn } from "@/lib/utils";

type BidHistoryListProps = {
  auctionId: string;
  bids: AuctionDetailBid[];
  auctionStatus: "Open" | "Closed" | "Cancelled";
};

function formatTimestamp(iso: string) {
  return format(parseISO(iso), "MMM d, h:mm a");
}

function formatCurrency(amount: number | undefined) {
  if (amount === undefined) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function BidRow({
  bid,
  highlightLabel,
  isOwnBid,
}: {
  bid: AuctionDetailBid;
  highlightLabel?: "Leading" | "Winner";
  isOwnBid?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-lg px-4 py-3 transition-colors",
        highlightLabel
          ? "bg-accent/8 ring-1 ring-accent/20"
          : isOwnBid
            ? "bg-primary/5 ring-1 ring-primary/15"
            : "hover:bg-muted/40",
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          highlightLabel === "Winner"
            ? "bg-accent/20 text-accent"
            : isOwnBid
              ? "bg-primary/15 text-primary"
              : "bg-muted/60 text-muted-foreground",
        )}
      >
        {highlightLabel === "Winner" ? (
          <Trophy className="size-3.5" />
        ) : (
          <User className="size-3.5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {formatCurrency(bid.amountUsdc)}
            </p>
            {highlightLabel ? (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-accent">
                {highlightLabel}
              </span>
            ) : null}
            {isOwnBid ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-primary">
                Your bid
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground/70">
          <time>{formatTimestamp(bid.timestamp)}</time>
          <a
            href={`https://sepolia.etherscan.io/tx/${bid.transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-3" />
            View tx
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Client component for bid history that matches subgraph bids against
 * the user's private bid data to identify which bids are theirs.
 */
export function BidHistoryList({
  auctionId,
  bids,
  auctionStatus,
}: BidHistoryListProps) {
  const { getBid } = usePrivateData();
  const privateBid = getBid(auctionId);

  const isOpen = auctionStatus === "Open";
  const isClosed = auctionStatus === "Closed";

  const ownBidAmountUsdc = useMemo(() => {
    if (!privateBid?.amount) return undefined;
    return Number(
      formatUnits(BigInt(privateBid.amount), CONFIDENTIAL_USDC_DECIMALS),
    );
  }, [privateBid]);

  const ownBidTransactionHash = useMemo(
    () => findOwnBidTransactionHash(bids, ownBidAmountUsdc),
    [bids, ownBidAmountUsdc],
  );

  return (
    <>
      {bids.map((bid, index) => {
        return (
          <BidRow
            key={bid.transactionHash}
            bid={bid}
            isOwnBid={bid.transactionHash === ownBidTransactionHash}
            highlightLabel={
              index === 0
                ? isClosed
                  ? "Winner"
                  : isOpen
                    ? "Leading"
                    : undefined
                : undefined
            }
          />
        );
      })}
    </>
  );
}
