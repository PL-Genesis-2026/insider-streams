import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Gavel,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  User,
} from "lucide-react";
import {
  SECRET_MARKETPLACE_ADDRESS,
  EXAMPLE_PREDICTION_MARKET_NAME,
} from "@private-streams/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SecretRevealCard } from "@/components/secret-reveal";
import { AuctionDetailPrivate } from "@/components/auction-detail-private";
import { AuctionBidGate } from "@/components/funding/auction-bid-gate";
import {
  getAuctionDetail,
  type AuctionDetailBid,
  type AuctionDetailData,
} from "@/lib/auction-detail";
import { cn } from "@/lib/utils";

type AuctionDetailPageProps = {
  params: Promise<{
    auctionId: string;
  }>;
};

type TimelineEventData = {
  type: "created" | "bid" | "closed" | "settled";
  label: string;
  detail: string;
  timestamp: string;
};

const DETAIL_BID_HISTORY_LIMIT = 100;

function formatTimestamp(iso: string) {
  return format(parseISO(iso), "MMM d, h:mm a");
}

function formatTimeShort(iso: string) {
  return format(parseISO(iso), "h:mm a");
}

function formatCurrency(amount: number | undefined) {
  if (amount === undefined) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatSignedNumber(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function shortHash(hash: string) {
  if (hash.length <= 14) {
    return hash;
  }

  return `${hash.slice(0, 8)}...${hash.slice(-4)}`;
}

function buildTimeline(auction: AuctionDetailData) {
  const timeline: TimelineEventData[] = [];

  if (auction.createdAt) {
    timeline.push({
      type: "created",
      label: "Auction created",
      detail: `Seller: ${auction.sellerAddress}`,
      timestamp: auction.createdAt,
    });
  }

  for (const bid of [...auction.bids].reverse()) {
    timeline.push({
      type: "bid",
      label: "Bid placed",
      detail: formatCurrency(bid.amountUsdc),
      timestamp: bid.timestamp,
    });
  }

  if (auction.closedAuction) {
    timeline.push({
      type: "closed",
      label: "Auction closed",
      detail: `Winning bid: ${formatCurrency(auction.closedAuction.winningBidUsdc)}`,
      timestamp: auction.closedAuction.timestamp,
    });
  }

  if (auction.cancelledAuction) {
    timeline.push({
      type: "closed",
      label: "Auction cancelled",
      detail: `Refunded amount: ${formatCurrency(auction.cancelledAuction.refundedAmountUsdc)}`,
      timestamp: auction.cancelledAuction.timestamp,
    });
  }

  for (const update of [...auction.reputationUpdates].reverse()) {
    timeline.push({
      type: "settled",
      label: "Reputation updated",
      detail: `Score ${update.newScore} (${formatSignedNumber(update.scoreChange)})`,
      timestamp: update.timestamp,
    });
  }

  return timeline.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-[0.22em] text-accent">
      {children}
    </span>
  );
}

function TimelineEvent({
  event,
  isLast,
}: {
  event: TimelineEventData;
  isLast: boolean;
}) {
  const iconMap: Record<TimelineEventData["type"], React.ReactNode> = {
    created: <Sparkles className="size-3.5" />,
    bid: <TrendingUp className="size-3.5" />,
    closed: <Gavel className="size-3.5" />,
    settled: <ShieldCheck className="size-3.5" />,
  };

  const colorMap: Record<TimelineEventData["type"], string> = {
    created: "border-accent/50 bg-accent/15 text-accent",
    bid: "border-border bg-muted/60 text-muted-foreground",
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
          <p className="text-sm font-medium text-foreground">{event.label}</p>
          <time className="text-xs text-muted-foreground/70">
            {formatTimeShort(event.timestamp)}
          </time>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{event.detail}</p>
      </div>
    </div>
  );
}

function BidRow({
  bid,
  highlightLabel,
}: {
  bid: AuctionDetailBid;
  highlightLabel?: "Leading" | "Winner";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-lg px-4 py-3 transition-colors",
        highlightLabel ? "bg-accent/8 ring-1 ring-accent/20" : "hover:bg-muted/40",
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          highlightLabel === "Winner"
            ? "bg-accent/20 text-accent"
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
          <p className="truncate text-sm font-medium text-foreground">
            {formatCurrency(bid.amountUsdc)}
            {highlightLabel ? (
              <span className="ml-2 text-xs font-normal text-accent">
                {highlightLabel}
              </span>
            ) : null}
          </p>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground/70">
          <time>{formatTimestamp(bid.timestamp)}</time>
          <span className="font-mono">{shortHash(bid.transactionHash)}</span>
        </div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function AuctionDetailPage({ params }: AuctionDetailPageProps) {
  const { auctionId } = await params;
  const auction = await getAuctionDetail({
    auctionId,
    bidLimit: DETAIL_BID_HISTORY_LIMIT,
  });

  if (!auction) {
    notFound();
  }

  const isOpen = auction.status === "Open";
  const isClosed = auction.status === "Closed";
  const statusVariant =
    auction.status === "Closed"
      ? "secondary"
      : auction.status === "Cancelled"
        ? "outline"
        : "accent";
  const timeline = buildTimeline(auction);

  return (
    <main className="theme-ember-editorial min-h-screen text-foreground">
      <AuctionDetailPrivate auctionId={auction.auctionId}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-8 md:px-10">
        <nav className="flex items-center gap-3 text-sm text-muted-foreground">
          <Button asChild variant="ghost" size="xs">
            <Link href="/" className="gap-1.5">
              <ArrowLeft className="size-3" />
              Auctions
            </Link>
          </Button>
          <span className="text-muted-foreground/40">/</span>
          <span className="truncate font-medium text-foreground">#{auction.auctionId}</span>
        </nav>

        <header className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-accent">
              <span>Auction #{auction.auctionId}</span>
              <span className="text-muted-foreground/40">/</span>
              <span>{EXAMPLE_PREDICTION_MARKET_NAME}</span>
            </div>
            <Badge variant={statusVariant}>{auction.status}</Badge>
            {auction.endTime ? (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="size-3.5" />
                Ends {formatTimestamp(auction.endTime)}
              </span>
            ) : null}
          </div>

          <h1 className="max-w-4xl font-serif text-[3.4rem] leading-[0.88] font-medium tracking-[-0.055em] text-foreground sm:text-[4.6rem]">
            {auction.title ?? `Auction #${auction.auctionId}`}
          </h1>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-8">
            <Card className="border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_98%,transparent),color-mix(in_srgb,var(--secondary)_18%,transparent))]">
              <CardHeader className="pb-0">
                <Label>Auction lifecycle</Label>
              </CardHeader>
              <CardContent>
                <div className="mt-1">
                  {timeline.map((event, index) => (
                    <TimelineEvent
                      key={`${event.type}-${event.timestamp}-${index}`}
                      event={event}
                      isLast={index === timeline.length - 1}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_98%,transparent),color-mix(in_srgb,var(--secondary)_18%,transparent))]">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <Label>Bid history</Label>
                  <span className="text-xs text-muted-foreground/60">{auction.bidCount} bid{auction.bidCount === 1 ? "" : "s"}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                {auction.bids.length > 0 ? (
                  auction.bids.map((bid, index) => (
                    <BidRow
                      key={bid.transactionHash}
                      bid={bid}
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
                  ))
                ) : (
                  <p className="rounded-lg bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    No bids have been placed for this auction yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-accent/30 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_6%,var(--card)),color-mix(in_srgb,var(--secondary)_22%,transparent))]">
              <CardHeader className="pb-0">
                <Label>Secret record</Label>
              </CardHeader>
              <CardContent>
                <SecretRevealCard auctionId={auction.auctionId} />
              </CardContent>
            </Card>
          </div>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-8 lg:self-start">
            <Card className="border-border/90 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_96%,transparent),color-mix(in_srgb,var(--secondary)_28%,transparent))]">
              {isOpen ? (
                <AuctionBidGate />
              ) : (
                <>
                  <CardHeader className="gap-5 pb-0">
                    <Label>Current bid</Label>
                    <div className="space-y-2">
                      <p className="font-serif text-[3.2rem] leading-none font-medium tracking-[-0.06em] text-foreground">
                        {auction.currentBidUsdc === undefined
                          ? "No bids yet"
                          : formatCurrency(auction.currentBidUsdc)}
                      </p>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <Separator className="mb-5" />
                    <div className="flex items-center justify-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-4 py-3 text-sm font-medium text-muted-foreground">
                      <ShieldCheck className="size-4 text-accent/70" />
                      Auction {auction.status.toLowerCase()}
                    </div>
                  </CardContent>
                </>
              )}
            </Card>

            <Card className="border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_98%,transparent),color-mix(in_srgb,var(--secondary)_18%,transparent))]">
              <CardHeader className="gap-4 pb-0">
                <Label>Seller</Label>
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <User className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/seller/${auction.sellerAddress}`}
                      className="block truncate text-sm font-medium text-foreground transition-colors hover:text-primary"
                    >
                      {auction.sellerAddress}
                    </Link>
                    {auction.sellerReputationScore !== undefined && (
                      <div className="mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          Rep: {auction.sellerReputationScore}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card className="border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_98%,transparent),color-mix(in_srgb,var(--secondary)_18%,transparent))]">
              <CardHeader className="pb-0">
                <Label>Details</Label>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Auction ID</span>
                    <p className="font-mono text-sm text-foreground">#{auction.auctionId}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Market ID</span>
                    <p className="font-mono text-sm text-foreground">{auction.marketId}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground/70">Created</span>
                    <time className="text-foreground">
                      {auction.createdAt ? formatTimestamp(auction.createdAt) : "Unavailable"}
                    </time>
                  </div>
                  {auction.endTime ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground/70">Ends</span>
                      <time className="text-foreground">
                        {formatTimestamp(auction.endTime)}
                      </time>
                    </div>
                  ) : null}
                </div>

                <Separator />

                <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                  <a
                    href={`https://sepolia.etherscan.io/address/${SECRET_MARKETPLACE_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-3" />
                    View on Etherscan
                  </a>
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
      </AuctionDetailPrivate>
    </main>
  );
}
