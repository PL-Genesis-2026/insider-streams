"use client";

import { useAppKit } from "@reown/appkit/react";
import { useDisconnect } from "wagmi";
import { LogOut, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";
import { formatAddress } from "@/lib/wallet/format-address";
import { ConnectWalletButton } from "./connect-wallet-button";
import { SwitchNetworkButton } from "./switch-network-button";

export function WalletAccountControl() {
  const walletSession = useWalletSession();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();

  if (!walletSession.isConnected || !walletSession.address) {
    return <ConnectWalletButton size="sm" variant="accent" />;
  }

  if (!walletSession.isSupportedChain) {
    return <SwitchNetworkButton size="sm" showError />;
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void open({ view: "Account" });
        }}
      >
        <Wallet className="size-3.5" />
        {formatAddress(walletSession.address)}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => disconnect()}
        title="Disconnect wallet"
      >
        <LogOut className="size-3.5" />
      </Button>
    </div>
  );
}
