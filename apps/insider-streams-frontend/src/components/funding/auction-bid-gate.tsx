"use client";

import Link from "next/link";
import {
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FundingStatusBadge } from "@/components/funding/funding-status-badge";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { getFundingStatusCopy } from "@/lib/funding/get-funding-snapshot";
import { useFundingSnapshot } from "@/lib/funding/use-funding-snapshot";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-[0.22em] text-accent">
      {children}
    </span>
  );
}

export function AuctionBidGate() {
  const fundingSnapshot = useFundingSnapshot();
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
              Switch to {fundingSnapshot.requiredChainName} to enter the
              funding flow for this auction.
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
              <Link href="/funding">
                Open wallet status
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/funding">
                Check wallet status
                <RefreshCw className="size-4" />
              </Link>
            </Button>
            <p className="text-xs leading-6 text-muted-foreground/70">
              This wallet does not have private balance yet. Start from the
              funding page with the vault flow, then come back once private
              funds appear.
            </p>
          </div>
        ) : null}

        {fundingSnapshot.status === "reconciling_transfer" ? (
          <div className="space-y-3">
            <Button type="button" className="w-full" disabled>
              <RefreshCw className="size-4 animate-spin" />
              Updating private wallet
            </Button>
            <p className="text-xs leading-6 text-muted-foreground/70">
              A private transfer was submitted. Insider Streams is refreshing
              the private wallet balance for this auction.
            </p>
          </div>
        ) : null}

        {fundingSnapshot.status === "funded" ||
        fundingSnapshot.status === "withdrawal_available" ? (
          <div className="rounded-lg border border-accent/30 bg-accent/8 px-4 py-3 text-sm text-muted-foreground">
            Funding is recognized. The future bid composer can plug into this
            slot without reworking the auction page layout.
          </div>
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
