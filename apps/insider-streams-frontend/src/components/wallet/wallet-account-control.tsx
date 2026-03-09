"use client";

import { useDisconnect } from "@reown/appkit/react";
import Link from "next/link";
import { CirclePlus, LogOut, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { FundingStatusBadge } from "@/components/funding/funding-status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getDisplayFundingBalance } from "@/lib/funding/format-funding-balance";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { formatAddress } from "@/lib/wallet/format-address";
import { useFundingSnapshot } from "@/lib/funding/use-funding-snapshot";
import { getDashboardTabHref } from "@/lib/dashboard-tabs";
import { usePrivateData } from "@/lib/private-data/use-private-data";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";

export function WalletAccountControl() {
  const walletSession = useWalletSession();
  const { disconnect } = useDisconnect();
  const { isRevealed } = usePrivateData();
  const fundingSnapshot = useFundingSnapshot({ enabled: isRevealed });
  const displayBalance = isRevealed
    ? getDisplayFundingBalance(fundingSnapshot.balance)
    : null;
  const shouldShowHiddenBalance = !isRevealed;
  const balanceLabel = displayBalance ?? "Wallet";

  if (!walletSession.isConnected || !walletSession.address) {
    return <ConnectWalletButton size="sm" variant="outline" />;
  }

  return (
    <div className="flex items-center gap-2">
      {isRevealed ? (
        <Badge asChild variant="secondary">
          <Link
            href={getDashboardTabHref("wallet")}
            className="border border-border/70 bg-secondary/70 px-3 py-1 text-[10px] tracking-[0.18em] text-secondary-foreground transition-colors hover:border-accent/40 hover:bg-secondary"
            aria-label={
              displayBalance
                ? `Open wallet controls on the dashboard, current balance ${displayBalance}`
                : "Open wallet controls on the dashboard"
            }
          >
            <CirclePlus className="size-3.5" />
            {balanceLabel}
          </Link>
        </Badge>
      ) : null}
      {shouldShowHiddenBalance ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge asChild variant="secondary">
              <Link
                href={getDashboardTabHref("wallet")}
                className="border border-border/70 bg-secondary/70 px-3 py-1 text-[10px] tracking-[0.18em] text-muted-foreground transition-colors hover:border-accent/40 hover:bg-secondary hover:text-secondary-foreground"
                aria-label="Open wallet controls on the dashboard. Reveal secret data to see balance."
              >
                <CirclePlus className="size-3.5" />
                ••• USDC
              </Link>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Open wallet controls
          </TooltipContent>
        </Tooltip>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={walletSession.isSupportedChain ? "outline" : "destructive"}
            size="sm"
            className="gap-2"
          >
            <Wallet className="size-4" />
            {formatAddress(walletSession.address)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="space-y-2">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/70">
                Connected wallet
              </p>
              <p className="font-mono text-xs text-foreground">
                {walletSession.address}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isRevealed ? (
                <FundingStatusBadge status={fundingSnapshot.status} />
              ) : (
                <span className="text-xs font-normal text-muted-foreground">
                  Private wallet status hidden until reveal.
                </span>
              )}
              <span className="text-xs font-normal text-muted-foreground">
                {walletSession.currentChainName ?? walletSession.requiredChainName}
              </span>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          {!walletSession.isSupportedChain ? (
            <div className="px-2 py-1.5">
              <p className="mb-2 text-xs leading-5 text-muted-foreground">
                Switch to {walletSession.requiredChainName} before checking
                private wallet status.
              </p>
              <SwitchNetworkButton size="sm" className="w-full" showError />
            </div>
          ) : null}

          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              void disconnect({ namespace: "eip155" });
            }}
          >
            Disconnect
            <LogOut className="ml-auto size-4" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
