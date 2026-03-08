"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CONFIDENTIAL_USDC_DECIMALS,
  PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
} from "@private-streams/common";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  Gavel,
  Loader2,
  RefreshCw,
  Shield,
  Wallet,
} from "lucide-react";
import {
  format,
  formatDistanceToNowStrict,
  isPast,
  isValid,
  parseISO,
} from "date-fns";
import { formatUnits, getAddress, isAddressEqual } from "viem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { BidModal } from "@/components/funding/bid-modal";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { fetchBuyerDashboard } from "@/lib/buyer-dashboard/api";
import type { BuyerDashboardAuction } from "@/lib/buyer-dashboard/types";
import { getFundingStatusCopy } from "@/lib/funding/get-funding-snapshot";
import { useFundingSnapshot } from "@/lib/funding/use-funding-snapshot";
import { usePrivateData } from "@/lib/private-data/use-private-data";
import { usePrivateBalancesMutation } from "@/lib/private-token/hooks";
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

function formatOptionalBidAmount(raw?: string | null): string | null {
  if (!raw) return null;
  return formatBidAmount(raw);
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

function findUsdcBalance(
  balances?: { token: string; amount: string }[],
): { token: string; amount: string } | undefined {
  return balances?.find((balance) => {
    try {
      return isAddressEqual(
        getAddress(balance.token),
        PRIVATE_CONFIDENTIAL_USDC_ADDRESS,
      );
    } catch {
      return false;
    }
  });
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

function BidStateBadge({ status }: { status: BuyerDashboardAuction["bids"][number]["status"] }) {
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
  const {
    data: privateBalanceLookup,
    isPending: isCheckingPrivateBalances,
    mutateAsync: loadPrivateBalances,
    error: privateBalancesError,
    reset: resetPrivateBalances,
  } = usePrivateBalancesMutation(walletSession.address);

  const [hideLost, setHideLost] = useState(true);
  const [hideResolvedWins, setHideResolvedWins] = useState(false);
  const [activeBidAuctionId, setActiveBidAuctionId] = useState<string | null>(
    null,
  );
  const lastWalletAddressRef = useRef<string | undefined>(walletSession.address);

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

  useEffect(() => {
    if (lastWalletAddressRef.current === walletSession.address) {
      return;
    }

    lastWalletAddressRef.current = walletSession.address;
    resetPrivateBalances();
  }, [resetPrivateBalances, walletSession.address]);

  useEffect(() => {
    if (
      !isRevealed ||
      !walletSession.address ||
      privateBalanceLookup !== undefined ||
      isCheckingPrivateBalances ||
      privateBalancesError
    ) {
      return;
    }

    void loadPrivateBalances({});
  }, [
    isCheckingPrivateBalances,
    isRevealed,
    loadPrivateBalances,
    privateBalancesError,
    privateBalanceLookup,
    walletSession.address,
  ]);

  const privateUsdcBalance = useMemo(
    () =>
      findUsdcBalance(
        privateBalanceLookup?.status === "ready"
          ? privateBalanceLookup.balances
          : [],
      ),
    [privateBalanceLookup],
  );

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

  const statusCopy = getFundingStatusCopy(fundingSnapshot.status);

  const handleReveal = useCallback(() => {
    void revealForAuctions([]);
  }, [revealForAuctions]);

  const handleRefresh = useCallback(() => {
    void Promise.all([
      dashboardQuery.refetch(),
      fundingSnapshot.refresh(),
      loadPrivateBalances({ forceFresh: true }),
    ]);
  }, [
    dashboardQuery,
    fundingSnapshot,
    loadPrivateBalances,
  ]);

  const activeAuction = useMemo(
    () =>
      auctions.find((auction) => auction.auctionId === activeBidAuctionId) ??
      null,
    [activeBidAuctionId, auctions],
  );

  const walletAmounts = useMemo(
    () => ({
      available: formatOptionalBidAmount(fundingSnapshot.balance?.available_balance),
      locked: formatOptionalBidAmount(fundingSnapshot.balance?.locked_balance),
      wonBids: formatOptionalBidAmount(
        fundingSnapshot.balance?.total_from_won_bids,
      ),
    }),
    [
      fundingSnapshot.balance?.available_balance,
      fundingSnapshot.balance?.locked_balance,
      fundingSnapshot.balance?.total_from_won_bids,
    ],
  );

  const privateUsdcBalanceState = useMemo(() => {
    if (isCheckingPrivateBalances) {
      return "Loading...";
    }

    if (privateBalancesError) {
      return "Lookup failed";
    }

    if (privateBalanceLookup?.status === "not_funded_yet") {
      return "Not funded yet";
    }

    if (privateUsdcBalance) {
      return formatBidAmount(privateUsdcBalance.amount);
    }

    if (privateBalanceLookup?.status === "ready") {
      return "No USDC balance";
    }

    return "Not checked";
  }, [
    isCheckingPrivateBalances,
    privateBalanceLookup,
    privateBalancesError,
    privateUsdcBalance,
  ]);

  if (!walletSession.isConnected) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
        <header className="max-w-3xl space-y-4">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-accent">
            Buyer dashboard
          </p>
          <h1 className="font-serif text-[3.4rem] leading-[0.9] tracking-[-0.05em] text-foreground">
            Track every auction where you have money in play.
          </h1>
          <p className="text-[1.04rem] leading-8 text-muted-foreground">
            Connect your wallet to see open positions, winnings, and recent bid
            activity in one place.
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
              Once connected, you can unlock your buyer view and check the
              auctions you are leading, the ones you already won, and the bids
              you may want to revisit.
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
            Buyer dashboard
          </p>
          <h1 className="font-serif text-[3.4rem] leading-[0.9] tracking-[-0.05em] text-foreground">
            Switch to Sepolia to open your dashboard.
          </h1>
          <p className="text-[1.04rem] leading-8 text-muted-foreground">
            This dashboard only works on the supported network for Insider
            Streams.
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 md:px-10 md:py-12">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_360px]">
        <Card className="overflow-hidden border-border/70 bg-[linear-gradient(135deg,rgba(195,146,110,0.18),transparent_42%),linear-gradient(180deg,color-mix(in_srgb,var(--card)_97%,transparent),color-mix(in_srgb,var(--secondary)_24%,transparent))]">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="outline">Buyer dashboard</Badge>
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
            <div className="max-w-3xl space-y-3">
              <CardTitle className="text-[3.2rem] leading-[0.9]">
                Your buyer position at a glance.
              </CardTitle>
              <CardDescription className="max-w-2xl text-[1.02rem] leading-8">
                See where you are ahead, what you already won, and how much
                buying power you still have left.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_97%,transparent),color-mix(in_srgb,var(--secondary)_16%,transparent))]">
          <CardHeader className="gap-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-accent">
              <Wallet className="size-3.5" />
              Wallet
            </div>
            <CardTitle className="text-[2.35rem]">Buying power</CardTitle>
            <CardDescription>{statusCopy.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isRevealed ? (
              <Button
                variant="accent"
                className="w-full"
                onClick={handleReveal}
                disabled={isRevealing}
              >
                {isRevealing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Eye className="size-4" />
                )}
                Unlock dashboard
              </Button>
            ) : null}

            <div className="grid gap-3">
              <div className="rounded-[calc(var(--radius)-4px)] border border-border/70 bg-muted/24 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/70">
                  Available
                </p>
                <p className="mt-2 font-serif text-[2rem] leading-none tracking-[-0.05em]">
                  {walletAmounts.available ?? "Unavailable"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[calc(var(--radius)-4px)] border border-border/70 bg-muted/24 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/70">
                    Locked
                  </p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {walletAmounts.locked ?? "Unavailable"}
                  </p>
                </div>
                <div className="rounded-[calc(var(--radius)-4px)] border border-border/70 bg-muted/24 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/70">
                    Won bids
                  </p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {walletAmounts.wonBids ?? "Unavailable"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[calc(var(--radius)-4px)] border border-border/70 bg-muted/18 p-4">
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 size-4 text-accent" />
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">
                    Balance breakdown
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    This view currently shows your total private balance. A
                    per-address breakdown is not available here yet.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-[calc(var(--radius)-4px)] border border-border/70 bg-muted/18 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Aggregate private USDC</span>
              <span className="font-medium text-foreground">
                {privateUsdcBalanceState}
              </span>
            </div>
            {privateBalancesError instanceof Error ? (
              <p className="text-sm leading-6 text-destructive">
                {privateBalancesError.message}
              </p>
            ) : null}

            <Button asChild variant="outline" className="w-full">
              <Link href="/funding">
                Manage wallet
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {revealError ? (
        <div className="rounded-[calc(var(--radius)+6px)] border border-destructive/35 bg-destructive/8 px-5 py-4 text-sm text-destructive">
          {revealError}
        </div>
      ) : null}

      {isRevealed ? (
        <section className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
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
              Unlock your buyer dashboard.
            </CardTitle>
            <CardDescription>
              Use one wallet signature to load your buyer-only activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl space-y-2 text-sm leading-7 text-muted-foreground">
              <p>
                You will see the auctions you bid on, whether you are winning,
                and the full bid trail for each position.
              </p>
              <p>
                Your private wallet balance will also appear here after you
                unlock the page.
              </p>
            </div>
            <Button
              variant="accent"
              className="w-full sm:w-auto"
              onClick={handleReveal}
              disabled={isRevealing}
            >
              {isRevealing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Eye className="size-4" />
              )}
              Unlock dashboard
            </Button>
          </CardContent>
        </Card>
      )}

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
