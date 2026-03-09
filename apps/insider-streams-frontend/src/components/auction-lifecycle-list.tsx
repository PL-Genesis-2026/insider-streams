"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  Gavel,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { formatUnits } from "viem";
import { usePrivateData } from "@/lib/private-data/use-private-data";
import { findOwnBidTransactionHash } from "@/lib/private-data/find-own-bid-transaction-hash";
import { cn } from "@/lib/utils";

export type AuctionTimelineEvent = {
  type: "created" | "bid" | "closed" | "settled";
  label: string;
  detail: string;
  timestamp: string;
  transactionHash?: string;
};

type AuctionLifecycleListProps = {
  auctionId: string;
  bids: {
    amountUsdc: number;
    timestamp: string;
    transactionHash: string;
  }[];
  timeline: AuctionTimelineEvent[];
};

function formatTimeShort(iso: string) {
  return format(parseISO(iso), "h:mm a");
}

function TimelineEvent({
  event,
  isLast,
  isOwnBid,
}: {
  event: AuctionTimelineEvent;
  isLast: boolean;
  isOwnBid: boolean;
}) {
  const iconMap: Record<AuctionTimelineEvent["type"], React.ReactNode> = {
    created: <Sparkles className="size-3.5" />,
    bid: <TrendingUp className="size-3.5" />,
    closed: <Gavel className="size-3.5" />,
    settled: <ShieldCheck className="size-3.5" />,
  };

  const colorMap: Record<AuctionTimelineEvent["type"], string> = {
    created: "border-accent/50 bg-accent/15 text-accent",
    bid: isOwnBid
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-border bg-muted/60 text-muted-foreground",
    closed: "border-primary/40 bg-primary/10 text-primary",
    settled: "border-accent/60 bg-accent/20 text-accent",
  };

  return (
    <div className="relative flex gap-4 pb-7 last:pb-0">
      {!isLast && (
        <div className="absolute left-[13px] top-8 h-[calc(100%-18px)] w-px bg-linear-to-b from-border/80 via-border/40 to-transparent" />
      )}

      <div
        className={cn(
          "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border",
          colorMap[event.type],
        )}
      >
        {iconMap[event.type]}
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{event.label}</p>
            {isOwnBid ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-primary">
                Your bid
              </span>
            ) : null}
          </div>
          <time className="text-xs text-muted-foreground/70">
            {formatTimeShort(event.timestamp)}
          </time>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{event.detail}</p>
      </div>
    </div>
  );
}

export function AuctionLifecycleList({
  auctionId,
  bids,
  timeline,
}: AuctionLifecycleListProps) {
  const { getBid } = usePrivateData();
  const privateBid = getBid(auctionId);

  const ownBidAmountUsdc = useMemo(() => {
    if (!privateBid?.amount) {
      return undefined;
    }

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
      {timeline.map((event, index) => (
        <TimelineEvent
          key={`${event.type}-${event.timestamp}-${index}`}
          event={event}
          isLast={index === timeline.length - 1}
          isOwnBid={
            event.type === "bid" &&
            event.transactionHash !== undefined &&
            event.transactionHash === ownBidTransactionHash
          }
        />
      ))}
    </>
  );
}
