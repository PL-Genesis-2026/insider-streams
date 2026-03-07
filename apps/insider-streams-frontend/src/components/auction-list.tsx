"use client";

import { useQuery } from "@apollo/client/react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { usePrivateData } from "@/lib/private-data/use-private-data";

const AUCTIONS_PAGE_SIZE = 30;
const AUCTION_POLL_INTERVAL_MS = 10_000;

const EXCLUDE_CLOSED: ("Closed" | "Cancelled")[] = ["Closed", "Cancelled"];

type AuctionListProps = {
  className?: string;
};

type AuctionFilterMode = "auto" | "open" | "all";

export function AuctionList({ className }: AuctionListProps) {
  const [page, setPage] = useState(0);
  const [filterMode, setFilterMode] = useState<AuctionFilterMode>("auto");
  const { seller, getBid, registerVisibleAuctions } = usePrivateData();

  const openAuctionsQuery = useQuery(HomepageAuctionsDocument, {
    variables: {
      limit: AUCTIONS_PAGE_SIZE,
      skip: page * AUCTIONS_PAGE_SIZE,
      where: { status_not_in: EXCLUDE_CLOSED },
    },
    pollInterval: AUCTION_POLL_INTERVAL_MS,
    skip: filterMode === "all",
  });

  const shouldAutoShowClosedAuctions =
    filterMode === "auto" &&
    page === 0 &&
    !openAuctionsQuery.loading &&
    !openAuctionsQuery.error &&
    (openAuctionsQuery.data?.auctions.length ?? 0) === 0;

  const allAuctionsQuery = useQuery(HomepageAuctionsDocument, {
    variables: {
      limit: AUCTIONS_PAGE_SIZE,
      skip: page * AUCTIONS_PAGE_SIZE,
      where: {},
    },
    pollInterval: AUCTION_POLL_INTERVAL_MS,
    skip: !(filterMode === "all" || shouldAutoShowClosedAuctions),
  });

  const displayingClosedAuctions =
    filterMode === "all" || shouldAutoShowClosedAuctions;
  const activeQuery = displayingClosedAuctions ? allAuctionsQuery : openAuctionsQuery;
  const auctions = useMemo(() => activeQuery.data?.auctions ?? [], [activeQuery.data]);
  const { loading, error } = activeQuery;

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

  useEffect(() => {
    const auctionIds = cards.map((c) => c.auctionId);
    registerVisibleAuctions("homepage", auctionIds);
  }, [cards, registerVisibleAuctions]);

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
    setFilterMode(displayingClosedAuctions ? "open" : "all");
    setPage(0);
  }, [displayingClosedAuctions]);

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
            {displayingClosedAuctions ? "All auctions" : "Live auctions"}
          </p>
          <h2 className="mt-2 font-serif text-[2.75rem] leading-[0.92] font-medium tracking-[-0.05em]">
            {displayingClosedAuctions ? "All signals" : "Open signals"}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleFilterToggle}
            className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
          >
            {displayingClosedAuctions ? "Show open only" : "Show all"}
          </button>
          <Badge variant={displayingClosedAuctions ? "secondary" : "accent"}>
            {cards.length}
            {auctions.length >= AUCTIONS_PAGE_SIZE ? "+" : ""} listed
          </Badge>
        </div>
      </div>

      {shouldAutoShowClosedAuctions ? (
        <div className="mb-6 rounded-[calc(var(--radius)+6px)] border border-border bg-muted/20 p-4 text-sm leading-7 text-muted-foreground">
          No open auctions are live right now, so recent closed and cancelled
          auctions are being shown instead.
        </div>
      ) : null}

      {cards.length > 0 ? (
        <div className="grid gap-5">
          {cards.map((auction) => (
            <AuctionCard
              key={auction.auctionId}
              auction={auction}
              href={`/auction/${auction.auctionId}`}
              privateBid={getBid(auction.auctionId)}
              isOwnAuction={
                !!seller?.address &&
                seller.address.toLowerCase() ===
                  auction.sellerAddress.toLowerCase()
              }
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[calc(var(--radius)+6px)] border border-border bg-muted/30 p-6 text-sm leading-7 text-muted-foreground">
          {displayingClosedAuctions
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
