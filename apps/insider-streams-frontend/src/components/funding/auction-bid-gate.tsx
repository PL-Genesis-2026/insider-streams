"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { CONFIDENTIAL_USDC_DECIMALS } from "@private-streams/common";
import { formatUnits } from "viem";
import { ArrowRight, Gavel, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FundingStatusBadge } from "@/components/funding/funding-status-badge";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { getFundingStatusCopy } from "@/lib/funding/get-funding-snapshot";
import { useFundingSnapshot } from "@/lib/funding/use-funding-snapshot";
import { usePrivateData } from "@/lib/private-data/use-private-data";
import { BidModal } from "@/components/funding/bid-modal";
import { getDashboardTabHref } from "@/lib/dashboard-tabs";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-[0.22em] text-accent">
      {children}
    </span>
  );
}

interface AuctionBidGateProps {
  auctionId: string;
  sellerAddress: string;
  currentBidUsdc?: number;
}

export function AuctionBidGate({
  auctionId,
  sellerAddress,
  currentBidUsdc,
}: AuctionBidGateProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const {
    seller,
    isRevealed,
    isLoading: isRevealingPrivateData,
    revealForAuctions,
  } = usePrivateData();
  const fundingSnapshot = useFundingSnapshot({ enabled: isRevealed });

  const isOwnAuction =
    !!seller?.id &&
    seller.id.toLowerCase() === sellerAddress.toLowerCase();

  const handleBidSuccess = useCallback(() => {
    void fundingSnapshot.refresh();
  }, [fundingSnapshot]);

  const statusCopy = getFundingStatusCopy(fundingSnapshot.status);
  const fundingErrorMessage =
    fundingSnapshot.error instanceof Error
      ? fundingSnapshot.error.message
      : null;
  const reconcileErrorMessage =
    fundingSnapshot.reconcileError instanceof Error
      ? fundingSnapshot.reconcileError.message
      : null;

  return (
    <>
      <CardHeader className="gap-5 pb-0">
        <div className="flex items-center justify-between gap-3">
          <Label>Bid access</Label>
          <FundingStatusBadge status={fundingSnapshot.status} />
        </div>
        <div className="space-y-2">
          <p className="font-serif text-[2.1rem] leading-none font-medium tracking-[-0.05em] text-foreground">
            {statusCopy.title}
          </p>
          <p className="text-sm leading-7 text-muted-foreground">
            {statusCopy.description}
          </p>
        </div>
        {fundingSnapshot.balance?.available_balance &&
          BigInt(fundingSnapshot.balance.available_balance) > BigInt(0) && (
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5">
              <span className="text-xs text-muted-foreground">
                Available balance
              </span>
              <span className="text-sm font-medium text-foreground">
                {Number(
                  formatUnits(
                    BigInt(fundingSnapshot.balance.available_balance),
                    CONFIDENTIAL_USDC_DECIMALS,
                  ),
                ).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          )}
      </CardHeader>

      <CardContent className="space-y-5">
        <Separator className="mb-5" />

        {fundingSnapshot.status === "wallet_required" ? (
          <div className="space-y-3">
            <ConnectWalletButton className="w-full" />
            <p className="text-xs leading-6 text-muted-foreground/70">
              Wallet connection is the first gate before checking private
              funding status and bidding.
            </p>
          </div>
        ) : null}

        {fundingSnapshot.status === "wrong_network" ? (
          <div className="space-y-3">
            <SwitchNetworkButton className="w-full" showError />
            <p className="text-xs leading-6 text-muted-foreground/70">
              Switch to {fundingSnapshot.requiredChainName} to enter the funding
              flow for this auction.
            </p>
          </div>
        ) : null}

        {fundingSnapshot.status === "private_data_hidden" ? (
          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={() => {
                void revealForAuctions([auctionId]);
              }}
              disabled={isRevealingPrivateData}
            >
              {isRevealingPrivateData ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Unlocking...
                </>
              ) : (
                <>
                  Unlock wallet
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
            <p className="text-xs leading-6 text-muted-foreground/70">
              Reveal private wallet access right here to check available bidding balance and any pending withdrawal before placing a bid.
            </p>
          </div>
        ) : null}

        {fundingSnapshot.status === "funding_unavailable" ? (
          <div className="space-y-3">
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                void fundingSnapshot.refresh();
              }}
            >
              Retry funding snapshot
              <RefreshCw className="size-4" />
            </Button>
            {fundingErrorMessage ? (
              <p className="text-xs leading-6 text-destructive">
                {fundingErrorMessage}
              </p>
            ) : null}
          </div>
        ) : null}

        {fundingSnapshot.status === "not_funded_yet" ? (
          <div className="space-y-3">
            <Button asChild className="w-full">
              <Link href={getDashboardTabHref("wallet")}>
                Deposit funds to bid
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={getDashboardTabHref("wallet")}>
                Manage wallet
                <RefreshCw className="size-4" />
              </Link>
            </Button>
            <p className="text-xs leading-6 text-muted-foreground/70">
              This wallet cannot bid yet. Deposit and activate funds from the dashboard wallet section, then come back here.
            </p>
          </div>
        ) : null}

        {fundingSnapshot.status === "reconciling_transfer" ? (
          <div className="space-y-3">
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                void fundingSnapshot.refresh();
              }}
            >
              Refresh transfer status
              <RefreshCw className="size-4" />
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={getDashboardTabHref("wallet")}>
                Manage wallet
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <p className="text-xs leading-6 text-muted-foreground/70">
              A wallet transfer is still settling. Wait for it to complete before placing another bid.
            </p>
          </div>
        ) : null}

        {fundingSnapshot.status === "funded" ||
        fundingSnapshot.status === "withdrawal_available" ? (
          <>
            {isOwnAuction ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full" tabIndex={0}>
                    <Button disabled className="pointer-events-none w-full">
                      Place Bid <Gavel className="size-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  You cannot bid on your own auction
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button onClick={() => setModalOpen(true)} className="w-full">
                Place Bid <Gavel className="size-4" />
              </Button>
            )}
            <BidModal
              open={modalOpen}
              onOpenChange={setModalOpen}
              auctionId={auctionId}
              currentBidUsdc={currentBidUsdc}
              availableBalance={
                fundingSnapshot.balance?.available_balance ?? null
              }
              onBidSuccess={handleBidSuccess}
            />
          </>
        ) : null}
        {reconcileErrorMessage ? (
          <p className="text-xs leading-6 text-destructive">
            {reconcileErrorMessage}
          </p>
        ) : null}
      </CardContent>
    </>
  );
}
