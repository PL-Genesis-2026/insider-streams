"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { AlertCircle, Plus, RefreshCw } from "lucide-react";
import { formatUnits } from "viem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuctionCard } from "@/components/auction-card";
import { usePrivateData } from "@/lib/private-data/use-private-data";
import { subgraphClient } from "@/lib/subgraph-client";
import { getSdk } from "@/__generated__/sdk";
import type { SellerDetailQuery } from "@/__generated__/sdk";

const sdk = getSdk(subgraphClient);

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function bigintToUsdc(value: bigint) {
  return Number(formatUnits(value, CONFIDENTIAL_USDC_DECIMALS));
}

function scalarToBigInt(value: unknown) {
  return BigInt(String(value));
}

type SellerSubgraph = NonNullable<SellerDetailQuery["seller"]>;

function mapSellerData(seller: SellerSubgraph) {
  const repScore = Number(scalarToBigInt(seller.reputationScore));
  const totalEarnings = bigintToUsdc(scalarToBigInt(seller.totalEarnings));

  return {
    sellerId: seller.sellerId,
    reputationScore: repScore,
    totalAuctionCount: seller.totalAuctionCount,
    openAuctionCount: seller.openAuctionCount,
    correctPredictions: seller.auctionsWithCorrectPredictionsCount,
    wrongPredictions: seller.auctionsWithWrongPredictionsCount,
    unscorableAuctions: seller.unscorableAuctionCount,
    totalEarningsUsdc: totalEarnings,
    auctions: seller.auctions.map((a) => {
      const currentBidBigInt = scalarToBigInt(a.currentBid);
      return {
        auctionId: String(a.auctionId),
        sellerAddress: seller.sellerId,
        marketId: String(a.eventId),
        status: String(a.status),
        currentBidUsdc:
          currentBidBigInt > BigInt(0)
            ? bigintToUsdc(currentBidBigInt)
            : undefined,
        bidCount: a.bidCount,
        endTime: new Date(Number(String(a.endTime)) * 1000).toISOString(),
        title: a.eventTitle,
        sellerReputationScore: repScore,
        sellerTotalAuctions: seller.totalAuctionCount,
        sellerCorrectPredictions:
          seller.auctionsWithCorrectPredictionsCount,
        sellerWrongPredictions:
          seller.auctionsWithWrongPredictionsCount,
      };
    }),
  };
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-[calc(var(--radius)-4px)] border border-border/70 bg-muted/24 p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/70">
        {label}
      </p>
      <p className="mt-3 font-serif text-[2rem] leading-none tracking-[-0.05em] text-foreground">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function SellerTab() {
  const {
    seller,
    isRevealed,
    resourceErrors,
  } = usePrivateData();

  const sellerId = seller?.id ?? null;

  const sellerQuery = useQuery({
    queryKey: ["seller-detail", sellerId],
    enabled: isRevealed && sellerId !== null,
    queryFn: () => sdk.SellerDetail({ sellerId: sellerId! }),
    select: (data) => (data.seller ? mapSellerData(data.seller) : null),
    staleTime: 60_000,
    refetchInterval: 30_000,
  });

  const detail = sellerQuery.data ?? null;

  if (isRevealed && sellerId === null && resourceErrors.seller) {
    return (
      <Card className="border-destructive/35 bg-destructive/8">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 text-destructive" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">
                Could not load your seller profile right now.
              </p>
              <p className="text-sm leading-6 text-destructive/90">
                {resourceErrors.seller}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No seller profile — show create CTA
  if (isRevealed && sellerId === null) {
    return (
      <Card className="border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_96%,transparent),color-mix(in_srgb,var(--secondary)_28%,transparent))]">
        <CardHeader>
          <CardTitle className="text-[2.4rem]">
            No signals yet
          </CardTitle>
          <CardDescription>
            Create your first auction to start selling predictions and building
            a reputation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-7 text-muted-foreground">
            Buyers compete for your insight in sealed auctions. Your track
            record grows with every settled market.
          </p>
          <Button asChild variant="accent" className="w-full sm:w-auto">
            <Link href="/create">
              <Plus className="size-4" />
              Create auction
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Seller profile exists — show stats + auctions
  if (isRevealed && sellerId !== null) {
    return (
      <div className="space-y-6">
        {/* Stats grid */}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Reputation"
            value={detail ? String(detail.reputationScore) : "—"}
            hint={
              detail
                ? `${detail.correctPredictions} correct, ${detail.wrongPredictions} wrong`
                : "Net score from correct and wrong predictions."
            }
          />
          <StatCard
            label="Total auctions"
            value={detail ? String(detail.totalAuctionCount) : "—"}
            hint="Every auction you have created."
          />
          <StatCard
            label="Open now"
            value={detail ? String(detail.openAuctionCount) : "—"}
            hint="Auctions still accepting bids."
          />
          <StatCard
            label="Earnings"
            value={detail ? usdFormat.format(detail.totalEarningsUsdc) : "—"}
            hint="Total USDC earned from closed auctions."
          />
        </section>

        {/* Section header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/50 pb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium text-foreground">
              Your auctions
            </h3>
            {detail ? (
              <span className="text-xs text-muted-foreground/50">
                ({detail.totalAuctionCount})
              </span>
            ) : null}
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/create">
              <Plus className="size-4" />
              New auction
            </Link>
          </Button>
        </div>

        {/* Auction list */}
        {sellerQuery.isLoading ? (
          <div className="flex flex-col gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-[calc(var(--radius)+6px)] border border-border/60 bg-muted/25"
              />
            ))}
          </div>
        ) : sellerQuery.isError ? (
          <Card className="border-destructive/35 bg-destructive/8">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 size-4 text-destructive" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive">
                    Could not load your seller profile right now.
                  </p>
                  <p className="text-sm leading-6 text-destructive/90">
                    {sellerQuery.error instanceof Error
                      ? sellerQuery.error.message
                      : "Unknown error"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : detail === null ? (
          <Card className="border-border/70 bg-muted/20">
            <CardHeader>
              <CardTitle className="text-[2.1rem]">
                Your seller profile is still syncing.
              </CardTitle>
              <CardDescription>
                If you just created your first auction, the subgraph may need a
                moment before this tab can show your signals.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                Refresh in a bit to load your auctions, reputation, and
                earnings once indexing catches up.
              </p>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => {
                  void sellerQuery.refetch();
                }}
              >
                <RefreshCw className="size-4" />
                Refresh profile
              </Button>
            </CardContent>
          </Card>
        ) : detail.auctions.length > 0 ? (
          <div className="grid gap-5">
            {detail.auctions.map((auction) => (
              <AuctionCard
                key={auction.auctionId}
                auction={auction}
                href={`/auction/${auction.auctionId}`}
                isOwnAuction
              />
            ))}
          </div>
        ) : detail.auctions.length === 0 ? (
          <Card className="border-border/70 bg-muted/20">
            <CardContent className="pt-6">
              <p className="text-sm leading-7 text-muted-foreground">
                No auctions yet. Use the button above to create one.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  return null;
}
