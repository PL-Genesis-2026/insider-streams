"use client";

import { useQuery } from "@apollo/client/react";
import { useCallback, useMemo, useState } from "react";
import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { formatUnits } from "viem";
import { HomepageAuctionsDocument } from "@/__generated__/graphql";
import type { AuctionCardData } from "@/components/auction-card";
import { AuctionCard } from "@/components/auction-card";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const AUCTIONS_PAGE_SIZE = 30;
const AUCTION_POLL_INTERVAL_MS = 10_000;

const EXCLUDE_CLOSED: ("Closed" | "Cancelled")[] = ["Closed", "Cancelled"];

type AuctionListProps = {
  className?: string;
};

export function AuctionList({ className }: AuctionListProps) {
  const [page, setPage] = useState(0);
  const [showClosedAuctions, setShowClosedAuctions] = useState(false);

  // Pass the entire `where` object as a variable — The Graph's _not_in
  // filter rejects null/empty arrays, so we omit it entirely when showing all.
  const where = showClosedAuctions
    ? {}
    : { status_not_in: EXCLUDE_CLOSED };

  const { data, loading, error } = useQuery(HomepageAuctionsDocument, {
    variables: {
      limit: AUCTIONS_PAGE_SIZE,
      skip: page * AUCTIONS_PAGE_SIZE,
      where,
    },
    pollInterval: AUCTION_POLL_INTERVAL_MS,
  });

  const auctions = data?.auctions ?? [];

  const cards: AuctionCardData[] = useMemo(() => {
    return auctions.map((a): AuctionCardData => {
      const currentBidBigInt = BigInt(String(a.currentBid));

      return {
        auctionId: String(a.auctionId),
        sellerAddress: String(a.sellerId),
        marketId: String(a.eventId),
        status: String(a.status),
        currentBidUsdc:
          currentBidBigInt > BigInt(0)
            ? Number(formatUnits(currentBidBigInt, CONFIDENTIAL_USDC_DECIMALS))
            : undefined,
        bidCount: a.bidCount,
        endTime: new Date(Number(String(a.endTime)) * 1000).toISOString(),
        title: a.eventTitle,
        sellerReputationScore: Number(a.seller.reputationScore),
        sellerTotalAuctions: a.seller.totalAuctionCount,
        sellerCorrectPredictions:
          a.seller.auctionsWithCorrectPredictionsCount,
        sellerWrongPredictions:
          a.seller.auctionsWithWrongPredictionsCount,
      };
    });
  }, [auctions]);

  const handlePrevious = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (page > 0) setPage((p) => p - 1);
    },
    [page],
  );

  const handleNext = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (auctions.length >= AUCTIONS_PAGE_SIZE) setPage((p) => p + 1);
    },
    [auctions.length],
  );

  const handleFilterToggle = useCallback(() => {
    setShowClosedAuctions((prev) => !prev);
    setPage(0);
  }, []);

  if (error) {
    return (
      <div className="rounded-[calc(var(--radius)+6px)] border border-destructive/35 bg-destructive/5 p-6 text-sm leading-7 text-muted-foreground">
        Auctions are temporarily unavailable because the configured subgraph
        endpoint did not return data.
      </div>
    );
  }

  if (loading && cards.length === 0) {
    return (
      <div className="grid gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-[calc(var(--radius)+6px)] border border-border/60 bg-muted/30"
          />
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-end justify-between gap-6 pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-accent">
            {showClosedAuctions ? "All auctions" : "Live auctions"}
          </p>
          <h2 className="mt-2 font-serif text-[2.75rem] leading-[0.92] font-medium tracking-[-0.05em]">
            {showClosedAuctions ? "All signals" : "Open signals"}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleFilterToggle}
            className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
          >
            {showClosedAuctions ? "Show open only" : "Show all"}
          </button>
          <Badge variant={showClosedAuctions ? "secondary" : "accent"}>
            {cards.length}
            {auctions.length >= AUCTIONS_PAGE_SIZE ? "+" : ""} listed
          </Badge>
        </div>
      </div>

      {cards.length > 0 ? (
        <div className="grid gap-5">
          {cards.map((auction) => (
            <AuctionCard
              key={auction.auctionId}
              auction={auction}
              href={`/auction/${auction.auctionId}`}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[calc(var(--radius)+6px)] border border-border bg-muted/30 p-6 text-sm leading-7 text-muted-foreground">
          {showClosedAuctions
            ? "No auctions found."
            : "No open auctions right now."}
        </div>
      )}

      {(page > 0 || auctions.length >= AUCTIONS_PAGE_SIZE) && (
        <Pagination className="mt-8">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={handlePrevious}
                aria-disabled={page === 0}
                className={
                  page === 0
                    ? "pointer-events-none opacity-50"
                    : undefined
                }
              />
            </PaginationItem>
            <PaginationItem>
              <span className="flex items-center px-4 text-sm text-muted-foreground">
                Page {page + 1}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={handleNext}
                aria-disabled={auctions.length < AUCTIONS_PAGE_SIZE}
                className={
                  auctions.length < AUCTIONS_PAGE_SIZE
                    ? "pointer-events-none opacity-50"
                    : undefined
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
