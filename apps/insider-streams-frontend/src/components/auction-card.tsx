"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { formatDistanceToNowStrict, isPast } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  EXAMPLE_PREDICTION_MARKET_NAME,
  CONFIDENTIAL_USDC_DECIMALS,
} from "@private-streams/common";
import { formatUnits } from "viem";
import { PredictionMarketLink } from "@/components/prediction-market-link";
import { cn } from "@/lib/utils";
import type { PrivateBidRecord } from "@/lib/private-data/types";

export type AuctionCardData = {
  auctionId: string;
  sellerAddress: string;
  marketId: string;
  outcome?: "yes" | "no";
  status: string;
  currentBidUsdc?: number;
  bidCount?: number;
  endTime?: string;
  title?: string;
  sellerReputationScore?: number;
  sellerTotalAuctions?: number;
  sellerCorrectPredictions?: number;
  sellerWrongPredictions?: number;
};

type AuctionCardProps = {
  auction: AuctionCardData;
  className?: string;
  href?: string;
  privateBid?: PrivateBidRecord;
  isOwnAuction?: boolean;
};

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function closesInLabel(endTime: string | undefined, status: string) {
  if (status !== "Open") return undefined;
  if (!endTime) return "Unknown";
  const end = new Date(endTime);
  if (isPast(end)) return "Ended";
  return `${formatDistanceToNowStrict(end)} left`;
}

function getCardDescription(auction: AuctionCardData) {
  if (auction.title && auction.outcome) {
    return `${auction.outcome === "yes" ? "Yes" : "No"} outcome on ${auction.title}.`;
  }

  return `Seller ${auction.sellerAddress} competing in market #${auction.marketId}.`;
}

function formatBidAmount(amount: string): string {
  const formatted = formatUnits(BigInt(amount), CONFIDENTIAL_USDC_DECIMALS);
  return `$${Number(formatted).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function BidStatusBadge({ bid }: { bid: PrivateBidRecord }) {
  switch (bid.status) {
    case "active":
      return (
        <Badge variant="accent">Your bid: {formatBidAmount(bid.amount)}</Badge>
      );
    case "won":
      return <Badge variant="secondary">Won</Badge>;
    case "outbid":
      return <Badge variant="muted">Outbid</Badge>;
    case "refunded":
      return <Badge variant="muted">Refunded</Badge>;
    default:
      return null;
  }
}

function MetaRail({
  auction,
  privateBid,
  isOwnAuction,
}: {
  auction: AuctionCardData;
  privateBid?: PrivateBidRecord;
  isOwnAuction?: boolean;
}) {
  const statusVariant =
    auction.status === "Settled" || auction.status === "Closed"
      ? "secondary"
      : "accent";

  const timeLabel = closesInLabel(auction.endTime, auction.status);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-accent">
        <span>{EXAMPLE_PREDICTION_MARKET_NAME}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant}>{auction.status}</Badge>
        {isOwnAuction && <Badge variant="outline">Your auction</Badge>}
        {privateBid && <BidStatusBadge bid={privateBid} />}
        {timeLabel && (
          <span className="text-sm text-muted-foreground">{timeLabel}</span>
        )}
      </div>
    </div>
  );
}

function BidModule({ auction }: { auction: AuctionCardData }) {
  return (
    <div className="rounded-[calc(var(--radius)-2px)] border border-border bg-muted/48 p-5">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-accent">
        Current bid
      </p>
      <p className="mt-3 font-serif text-[3rem] leading-none font-medium tracking-[-0.06em] text-foreground">
        {auction.currentBidUsdc === undefined
          ? "No bids yet"
          : usdFormat.format(auction.currentBidUsdc)}
      </p>
      {auction.bidCount !== undefined && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {auction.bidCount} bid{auction.bidCount === 1 ? "" : "s"}
        </p>
      )}
      <div className="mt-5 border-t border-border pt-4">
        <p className="text-xs uppercase tracking-[0.22em] text-accent">
          Market
        </p>
        <div className="mt-2">
          <PredictionMarketLink
            marketId={auction.marketId}
            variant="inline"
            className="relative z-20"
          />
        </div>
      </div>
    </div>
  );
}

function ReputationBadge({ auction }: { auction: AuctionCardData }) {
  if (auction.sellerReputationScore === undefined) return null;

  const correct = auction.sellerCorrectPredictions ?? 0;
  const wrong = auction.sellerWrongPredictions ?? 0;
  const total = auction.sellerTotalAuctions ?? 0;

  return (
    <TooltipProvider delayDuration={1000}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="relative z-20">
            <Badge variant="outline" className="cursor-default text-[10px]">
              Rep: {auction.sellerReputationScore}
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="w-48 space-y-2 bg-popover px-4 py-3 text-popover-foreground shadow-lg"
        >
          <p className="text-xs font-medium">Seller reputation</p>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Correct</span>
              <span className="font-medium">{correct}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Wrong</span>
              <span className="font-medium">{wrong}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total auctions</span>
              <span className="font-medium">{total}</span>
            </div>
          </div>
          {/* TODO: Replace with pie chart visualization */}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function TraceRow({ auction }: { auction: AuctionCardData }) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="text-xs uppercase tracking-[0.22em] text-accent">
          Seller
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            router.push(`/seller/${encodeURIComponent(auction.sellerAddress)}`);
          }}
          title={auction.sellerAddress}
          className="relative z-10 break-all text-left font-medium text-foreground transition-colors hover:text-primary"
        >
          {auction.sellerAddress}
        </button>
        <ReputationBadge auction={auction} />
      </div>
      <div>
        <span className="text-xs uppercase tracking-[0.22em] text-accent">
          Auction
        </span>
        <span className="ml-3">#{auction.auctionId}</span>
      </div>
    </div>
  );
}

export function AuctionCard({
  auction,
  className,
  href,
  privateBid,
  isOwnAuction,
}: AuctionCardProps) {
  const titleLabel = auction.title ?? `Auction #${auction.auctionId}`;

  const cardContent = (
    <Card
      className={cn(
        "border-border/90 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_98%,transparent),color-mix(in_srgb,var(--secondary)_22%,transparent))] transition-[border-color,box-shadow] duration-120 ease-out hover:border-primary/30 hover:shadow-[0_18px_48px_rgba(0,0,0,0.22)] group-hover:border-primary/30 group-hover:shadow-[0_18px_48px_rgba(0,0,0,0.22)]",
        className,
      )}
    >
      <CardHeader className="gap-4 pb-5">
        <MetaRail
          auction={auction}
          privateBid={privateBid}
          isOwnAuction={isOwnAuction}
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_250px] lg:items-start">
          <div className="min-w-0">
            <CardTitle className="max-w-3xl text-[2.7rem] leading-[0.92]">
              {titleLabel}
            </CardTitle>
            <CardDescription className="mt-4 max-w-2xl text-[1.02rem] leading-8">
              {getCardDescription(auction)}
            </CardDescription>
          </div>
          <BidModule auction={auction} />
        </div>
      </CardHeader>

      <CardContent className="border-t border-border pt-5">
        <div className="flex items-end justify-between gap-6">
          <TraceRow auction={auction} />
          <div className="flex shrink-0 items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground/70 transition-colors duration-100 ease-out group-hover:text-primary">
            <span>View auction</span>
            <ArrowRight
              className="size-3.5 transition-transform duration-100 ease-out group-hover:translate-x-0.5"
              aria-hidden
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!href) {
    return cardContent;
  }

  return (
    <div className="group relative rounded-[calc(var(--radius)+6px)]">
      <Link
        href={href}
        className="absolute inset-0 z-10 rounded-[calc(var(--radius)+6px)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`View ${titleLabel}`}
      />
      {cardContent}
    </div>
  );
}
