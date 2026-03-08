"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import {
  AlertCircle,
  ArrowRight,
  Gavel,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  format,
  formatDistanceToNowStrict,
  isPast,
  isValid,
  parseISO,
} from "date-fns";
import { formatUnits } from "viem";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { WalletActionCenter } from "@/components/dashboard/wallet-action-center";
import { BidModal } from "@/components/funding/bid-modal";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { fetchBuyerDashboard } from "@/lib/buyer-dashboard/api";
import type { BuyerDashboardAuction } from "@/lib/buyer-dashboard/types";
import { useFundingSnapshot } from "@/lib/funding/use-funding-snapshot";
import { usePrivateData } from "@/lib/private-data/use-private-data";
import { useSignedWalletSession } from "@/lib/wallet/use-signed-wallet-session";
import { formatAddress } from "@/lib/wallet/format-address";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";

const usdPreciseFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatBidAmount(raw: string): string {
  return usdPreciseFormat.format(
    Number(formatUnits(BigInt(raw), CONFIDENTIAL_USDC_DECIMALS)),
  );
}

function rawUsdcToNumber(raw?: string | null): number | undefined {
  if (!raw) return undefined;
  return Number(formatUnits(BigInt(raw), CONFIDENTIAL_USDC_DECIMALS));
}

function getAuctionTimeLabel(auction: BuyerDashboardAuction): string {
  if (!auction.endTime) return "Timing unavailable";

  const endTime = parseISO(auction.endTime);
  if (!isValid(endTime)) return "Timing unavailable";
  if (auction.status !== "Open") {
    return `Ended ${formatDistanceToNowStrict(endTime, { addSuffix: true })}`;
  }
  if (isPast(endTime)) return "Closing soon";
  return `Closes ${formatDistanceToNowStrict(endTime, { addSuffix: true })}`;
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  hint: string;
}) {
  return (
    <div className="rounded-[calc(var(--radius)-4px)] border border-border/70 bg-muted/24 p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/70">
        {label}
      </p>
      <p className="mt-3 font-serif text-[2rem] leading-none tracking-[-0.05em] text-foreground">
        {value ?? "Unavailable"}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{hint}</p>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-[calc(var(--radius)-6px)] border border-border/70 bg-muted/20 px-4 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function BidStateBadge({
  status,
}: {
  status: BuyerDashboardAuction["bids"][number]["status"];
}) {
  switch (status) {
    case "active":
      return <Badge variant="accent">Leading</Badge>;
    case "won":
      return <Badge variant="secondary">Won</Badge>;
    case "outbid":
      return <Badge variant="muted">Outbid</Badge>;
    case "refunded":
      return <Badge variant="outline">Refunded</Badge>;
    default:
      return null;
  }
}

function AuctionStatusBadge({ status }: { status: string }) {
  if (status === "Open") {
    return <Badge variant="accent">Open</Badge>;
  }
  if (status === "Closed") {
    return <Badge variant="secondary">Closed</Badge>;
  }
  if (status === "Cancelled") {
    return <Badge variant="outline">Cancelled</Badge>;
  }
  return <Badge variant="muted">{status}</Badge>;
}

export function BuyerDashboard() {
  const walletSession = useWalletSession();
  const { getSignedSession } = useSignedWalletSession();
  const {
    isRevealed,
    isLoading: isRevealing,
    error: revealError,
    revealForAuctions,
  } = usePrivateData();

  const fundingSnapshot = useFundingSnapshot({ enabled: isRevealed });
  const [activeTab, setActiveTab] = useState<"wallet" | "positions">("wallet");
  const [hideLost, setHideLost] = useState(true);
  const [hideResolvedWins, setHideResolvedWins] = useState(false);
  const [activeBidAuctionId, setActiveBidAuctionId] = useState<string | null>(
    null,
  );

  const dashboardQuery = useQuery({
    queryKey: ["buyer-dashboard", walletSession.address],
    enabled:
      isRevealed &&
      walletSession.isConnected &&
      walletSession.isSupportedChain &&
      Boolean(walletSession.address),
    queryFn: async () => {
      const { signature, timestamp } = await getSignedSession();
      return fetchBuyerDashboard(signature, timestamp);
    },
    staleTime: 30_000,
    refetchInterval: 15_000,
  });

  const auctions = useMemo(
    () => dashboardQuery.data?.auctions ?? [],
    [dashboardQuery.data],
  );

  const filteredAuctions = useMemo(() => {
    return auctions.filter((auction) => {
      const latestBid = auction.bids[0];
      if (!latestBid) return false;

      if (
        hideLost &&
        (latestBid.status === "outbid" || latestBid.status === "refunded")
      ) {
        return false;
      }

      if (
        hideResolvedWins &&
        latestBid.status === "won" &&
        auction.predictionOutcome !== null
      ) {
        return false;
      }

      return true;
    });
  }, [auctions, hideLost, hideResolvedWins]);

  const summary = useMemo(() => {
    if (!dashboardQuery.data) {
      return null;
    }

    let leadingCount = 0;
    let wonCount = 0;
    let exposureRaw = BigInt(0);

    for (const auction of auctions) {
      const latestBid = auction.bids[0];
      if (!latestBid) continue;

      if (latestBid.status === "active") {
        leadingCount += 1;
        exposureRaw += BigInt(latestBid.amount);
      }

      if (latestBid.status === "won") {
        wonCount += 1;
        exposureRaw += BigInt(latestBid.amount);
      }
    }

    return {
      auctionCount: auctions.length,
      totalBidCount: auctions.reduce((sum, auction) => sum + auction.bids.length, 0),
      leadingCount,
      wonCount,
      exposure: formatBidAmount(exposureRaw.toString()),
    };
  }, [auctions, dashboardQuery.data]);

  const handleReveal = useCallback(() => {
    void revealForAuctions([]);
  }, [revealForAuctions]);

  const handleRefresh = useCallback(() => {
    void Promise.allSettled([dashboardQuery.refetch(), fundingSnapshot.refresh()]);
  }, [dashboardQuery, fundingSnapshot]);

  const activeAuction = useMemo(
    () =>
      auctions.find((auction) => auction.auctionId === activeBidAuctionId) ??
      null,
    [activeBidAuctionId, auctions],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTabFromHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash === "#positions") {
        setActiveTab("positions");
        return;
      }
      if (hash === "#wallet") {
        setActiveTab("wallet");
        return;
      }
      setActiveTab(isRevealed ? "positions" : "wallet");
    };

    syncTabFromHash();
    window.addEventListener("hashchange", syncTabFromHash);

    return () => {
      window.removeEventListener("hashchange", syncTabFromHash);
    };
  }, [isRevealed]);

  useEffect(() => {
    if (!isRevealed && activeTab !== "wallet") {
      setActiveTab("wallet");
    }
  }, [activeTab, isRevealed]);

  const handleTabChange = useCallback((nextTab: string) => {
    const normalized = nextTab === "positions" ? "positions" : "wallet";
    setActiveTab(normalized);

    if (typeof window === "undefined") return;
    const nextHash = normalized === "positions" ? "#positions" : "#wallet";
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(null, "", nextUrl);
  }, []);

  if (!walletSession.isConnected) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
        <header className="max-w-3xl space-y-4">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-accent">
            Dashboard
          </p>
          <h1 className="font-serif text-[3.4rem] leading-[0.9] tracking-[-0.05em] text-foreground">
            Connect once. Manage wallet and positions here.
          </h1>
          <p className="text-[1.04rem] leading-8 text-muted-foreground">
            The dashboard is now the wallet home for Insider Streams. Deposit, withdraw, and track auction exposure from the same route.
          </p>
        </header>

        <Card className="border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_96%,transparent),color-mix(in_srgb,var(--secondary)_28%,transparent))]">
          <CardHeader>
            <CardTitle className="text-[2.4rem]">Connect wallet</CardTitle>
            <CardDescription>
              Your buyer view follows the wallet you have connected.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm leading-7 text-muted-foreground">
              Connect your wallet to reveal the wallet section, fund bidding balance, and load the positions tied to this address.
            </p>
            <ConnectWalletButton className="w-full sm:w-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!walletSession.isSupportedChain) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
        <header className="max-w-3xl space-y-4">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-accent">
            Dashboard
          </p>
          <h1 className="font-serif text-[3.4rem] leading-[0.9] tracking-[-0.05em] text-foreground">
            Switch to Sepolia to open your wallet dashboard.
          </h1>
          <p className="text-[1.04rem] leading-8 text-muted-foreground">
            Wallet actions and buyer positions only work on the supported Insider Streams network.
          </p>
        </header>

        <Card className="border-border/70 bg-muted/24">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm leading-7 text-muted-foreground">
              Your wallet is connected, but this network cannot show your buyer
              positions here.
            </p>
            <SwitchNetworkButton className="w-full sm:w-auto" showError />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 md:px-10 md:py-12">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-6">
        <nav className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4">
          <TabsList className="h-auto w-auto gap-0 rounded-none border-none bg-transparent p-0">
            <TabsTrigger
              value="wallet"
              className="relative gap-2 rounded-none border-none bg-transparent px-5 py-2.5 text-base font-medium text-muted-foreground/60 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-[17px] after:h-[2px] after:rounded-full after:bg-accent after:opacity-0 after:transition-opacity data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:opacity-100"
            >
              <Wallet className="size-4" />
              Wallet
            </TabsTrigger>
            <TabsTrigger
              value="positions"
              className="relative gap-2 rounded-none border-none bg-transparent px-5 py-2.5 text-base font-medium text-muted-foreground/60 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-[17px] after:h-[2px] after:rounded-full after:bg-accent after:opacity-0 after:transition-opacity data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:opacity-100"
            >
              <Gavel className="size-4" />
              Positions
              {summary ? (
                <span className="ml-0.5 text-xs text-muted-foreground/50">
                  ({filteredAuctions.length})
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            {isRevealed ? (
              <Badge variant={fundingSnapshot.canPlaceBid ? "secondary" : "outline"}>
                {fundingSnapshot.canPlaceBid ? "Ready to bid" : "Setup needed"}
              </Badge>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={!isRevealed || dashboardQuery.isFetching}
            >
              {dashboardQuery.isFetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
          </div>
        </nav>

        <TabsContent value="wallet" className="space-y-4">
          <WalletActionCenter
            id="wallet"
            isRevealed={isRevealed}
            isRevealing={isRevealing}
            onReveal={handleReveal}
          />

          {revealError ? (
            <div className="rounded-[calc(var(--radius)+6px)] border border-destructive/35 bg-destructive/8 px-5 py-4 text-sm text-destructive">
              {revealError}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="positions" className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Tracked auctions"
              value={summary ? String(summary.auctionCount) : null}
              hint="Auctions where this wallet has placed at least one bid."
            />
            <MetricCard
              label="Leading now"
              value={summary ? String(summary.leadingCount) : null}
              hint="Open auctions where your latest bid is still on top."
            />
            <MetricCard
              label="Won"
              value={summary ? String(summary.wonCount) : null}
              hint="Auctions already marked as won for this wallet."
            />
            <MetricCard
              label="Exposure"
              value={summary?.exposure ?? null}
              hint="Current size of your leading and won positions."
            />
          </section>

          {revealError ? (
            <div className="rounded-[calc(var(--radius)+6px)] border border-destructive/35 bg-destructive/8 px-5 py-4 text-sm text-destructive">
              {revealError}
            </div>
          ) : null}

          {isRevealed ? (
            <section
              id="positions"
              className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]"
            >
              <Card className="h-fit border-border/70 bg-muted/18 xl:sticky xl:top-6">
                <CardHeader className="gap-3">
                  <CardTitle className="text-[2.15rem]">Filters</CardTitle>
                  <CardDescription>
                    Focus on the positions you still want to watch.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ToggleRow
                    label="Hide auctions you lost"
                    checked={hideLost}
                    onCheckedChange={setHideLost}
                  />
                  <ToggleRow
                    label="Hide settled wins"
                    checked={hideResolvedWins}
                    onCheckedChange={setHideResolvedWins}
                  />
                  <Separator />
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="flex items-center justify-between">
                      <span>Visible auctions</span>
                      <span className="font-medium text-foreground">
                        {summary ? filteredAuctions.length : "Unavailable"}
                      </span>
                    </p>
                    <p className="flex items-center justify-between">
                      <span>Total bids</span>
                      <span className="font-medium text-foreground">
                        {summary ? summary.totalBidCount : "Unavailable"}
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-5">
                {dashboardQuery.isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-64 animate-pulse rounded-[calc(var(--radius)+6px)] border border-border/60 bg-muted/25"
                    />
                  ))
                ) : dashboardQuery.isError ? (
                  <Card className="border-destructive/35 bg-destructive/8">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 size-4 text-destructive" />
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-destructive">
                            Dashboard unavailable right now.
                          </p>
                          <p className="text-sm leading-6 text-destructive/90">
                            {dashboardQuery.error instanceof Error
                              ? dashboardQuery.error.message
                              : "Unknown error"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : filteredAuctions.length === 0 ? (
                  <Card className="border-border/70 bg-muted/20">
                    <CardContent className="pt-6">
                      <p className="text-sm leading-7 text-muted-foreground">
                        No positions match these filters.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredAuctions.map((auction) => {
                    const latestBid = auction.bids[0];
                    if (!latestBid) return null;

                    const canOpenBidModal =
                      auction.status === "Open" &&
                      latestBid.status !== "active" &&
                      fundingSnapshot.canPlaceBid;

                    const actionLabel =
                      auction.status === null
                        ? "Auction unavailable"
                        : auction.status !== "Open"
                          ? "Auction closed"
                          : latestBid.status === "active"
                            ? "Leading"
                            : fundingSnapshot.canPlaceBid
                              ? "Place new bid"
                              : "Fund wallet to bid";

                    return (
                      <Card
                        key={auction.auctionId}
                        className="border-border/80 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_98%,transparent),color-mix(in_srgb,var(--secondary)_18%,transparent))]"
                      >
                        <CardHeader className="gap-4 pb-4">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                {auction.status ? (
                                  <AuctionStatusBadge status={auction.status} />
                                ) : (
                                  <Badge variant="outline">Details unavailable</Badge>
                                )}
                                <BidStateBadge status={latestBid.status} />
                                {auction.predictionOutcome !== null ? (
                                  <Badge variant="outline">Market settled</Badge>
                                ) : null}
                              </div>
                              <div>
                                <CardTitle className="text-[2.35rem] leading-[0.94]">
                                  {auction.title ?? `Auction #${auction.auctionId}`}
                                </CardTitle>
                                <CardDescription className="mt-2">
                                  {auction.endTime
                                    ? getAuctionTimeLabel(auction)
                                    : "Auction details are temporarily unavailable."}
                                </CardDescription>
                              </div>
                            </div>

                            <div className="grid min-w-[220px] gap-3 sm:grid-cols-2 lg:min-w-[300px]">
                              <div className="rounded-[calc(var(--radius)-4px)] border border-border/70 bg-muted/24 p-4">
                                <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/70">
                                  Latest bid
                                </p>
                                <p className="mt-2 font-serif text-[1.8rem] leading-none tracking-[-0.05em]">
                                  {formatBidAmount(latestBid.amount)}
                                </p>
                              </div>
                              <div className="rounded-[calc(var(--radius)-4px)] border border-border/70 bg-muted/24 p-4">
                                <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/70">
                                  Auto-bet amount
                                </p>
                                <p className="mt-2 font-serif text-[1.8rem] leading-none tracking-[-0.05em]">
                                  {latestBid.status === "active" || latestBid.status === "won"
                                    ? formatBidAmount(latestBid.amount)
                                    : "Not winning"}
                                </p>
                              </div>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-5">
                          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[calc(var(--radius)-4px)] border border-border/70 bg-muted/18 px-4 py-3 text-sm">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="text-muted-foreground">Seller</span>
                              {auction.sellerId ? (
                                <Link
                                  href={`/seller/${encodeURIComponent(auction.sellerId)}`}
                                  className="font-medium text-foreground transition-colors hover:text-accent"
                                >
                                  {formatAddress(auction.sellerId)}
                                </Link>
                              ) : (
                                <span className="font-medium text-foreground">
                                  Unavailable
                                </span>
                              )}
                              {auction.sellerReputationScore !== null ? (
                                <Badge variant="outline">
                                  Rep {auction.sellerReputationScore}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                              {auction.marketId ? <span>Market #{auction.marketId}</span> : null}
                              <span>Auction #{auction.auctionId}</span>
                              {auction.bidCount !== null ? (
                                <span>{auction.bidCount} total bids</span>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm leading-7 text-muted-foreground">
                              {auction.status === null
                                ? "Your bid history is available, but the full auction details could not be loaded right now."
                                : latestBid.status === "active"
                                  ? "You are currently leading this auction."
                                  : latestBid.status === "won"
                                    ? "You won this auction."
                                    : latestBid.status === "refunded"
                                      ? "This position has already been refunded."
                                      : "You have been outbid."}
                            </p>
                            <div className="flex flex-wrap gap-3">
                              <Button asChild variant="outline">
                                <Link href={`/auction/${auction.auctionId}`}>
                                  View auction
                                  <ArrowRight className="size-4" />
                                </Link>
                              </Button>
                              <Button
                                onClick={() => setActiveBidAuctionId(auction.auctionId)}
                                disabled={!canOpenBidModal}
                              >
                                {actionLabel}
                                <Gavel className="size-4" />
                              </Button>
                            </div>
                          </div>

                          <Accordion type="single" collapsible>
                            <AccordionItem
                              value={`auction-${auction.auctionId}`}
                              className="border-border/70"
                            >
                              <AccordionTrigger className="py-3 hover:no-underline">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="text-sm font-medium text-foreground">
                                    Your bid trail
                                  </span>
                                  <Badge variant="muted">
                                    {auction.bids.length} bid
                                    {auction.bids.length === 1 ? "" : "s"}
                                  </Badge>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="space-y-3 pt-1">
                                {auction.bids.map((bid) => (
                                  <div
                                    key={bid.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-[calc(var(--radius)-6px)] border border-border/60 bg-muted/16 px-4 py-3"
                                  >
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium text-foreground">
                                          {formatBidAmount(bid.amount)}
                                        </span>
                                        <BidStateBadge status={bid.status} />
                                      </div>
                                      <p className="text-xs leading-5 text-muted-foreground">
                                        {format(parseISO(bid.created_at), "MMM d, yyyy 'at' HH:mm")}
                                      </p>
                                    </div>
                                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">
                                      {bid.status === "active"
                                        ? "Currently winning"
                                        : bid.status === "won"
                                          ? "Won"
                                          : bid.status === "refunded"
                                            ? "Refunded"
                                            : "Outbid"}
                                    </div>
                                  </div>
                                ))}
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </section>
          ) : (
            <Card className="border-border/70 bg-muted/20">
              <CardHeader>
                <CardTitle className="text-[2.4rem]">
                  Positions stay hidden until you unlock the wallet.
                </CardTitle>
                <CardDescription>
                  Use the wallet tab to reveal balances and buyer-only auction activity together.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl space-y-2 text-sm leading-7 text-muted-foreground">
                  <p>
                    You will see the auctions you bid on, whether you are winning,
                    and the full bid trail for each position.
                  </p>
                  <p>
                    Your private wallet balance will also appear after you unlock the wallet tab.
                  </p>
                </div>
                <Button
                  variant="accent"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    handleTabChange("wallet");
                    handleReveal();
                  }}
                  disabled={isRevealing}
                >
                  {isRevealing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Unlock wallet
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <BidModal
        open={activeAuction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveBidAuctionId(null);
          }
        }}
        auctionId={activeAuction?.auctionId ?? ""}
        currentBidUsdc={rawUsdcToNumber(activeAuction?.currentBid)}
        availableBalance={fundingSnapshot.balance?.available_balance ?? null}
        onBidSuccess={() => {
          void Promise.all([dashboardQuery.refetch(), fundingSnapshot.refresh()]);
        }}
      />
    </div>
  );
}
