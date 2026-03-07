"use client";

import Link from "next/link";
import { CirclePlus, LogOut, Wallet } from "lucide-react";
import { useDisconnect } from "wagmi";
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
import { getDisplayFundingBalance } from "@/lib/funding/format-funding-balance";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { formatAddress } from "@/lib/wallet/format-address";
import { useFundingSnapshot } from "@/lib/funding/use-funding-snapshot";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";

export function WalletAccountControl() {
  const fundingSnapshot = useFundingSnapshot();
  const walletSession = useWalletSession();
  const { disconnect } = useDisconnect();
  const displayBalance = getDisplayFundingBalance(fundingSnapshot.balance);

  if (!walletSession.isConnected || !walletSession.address) {
    return <ConnectWalletButton size="sm" variant="outline" />;
  }

  return (
    <div className="flex items-center gap-2">
      {displayBalance ? (
        <Badge asChild variant="secondary">
          <Link
            href="/funding"
            className="border border-border/70 bg-secondary/70 px-3 py-1 text-[10px] tracking-[0.18em] text-secondary-foreground transition-colors hover:border-accent/40 hover:bg-secondary"
            aria-label={`Open funding page, current balance ${displayBalance}`}
          >
            <CirclePlus className="size-3.5" />
            {displayBalance}
          </Link>
        </Badge>
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
              <FundingStatusBadge status={fundingSnapshot.status} />
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
              disconnect();
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
