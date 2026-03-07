"use client";

import { useAppKit, useAppKitState } from "@reown/appkit/react";
import { Loader2, Wallet } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConnectWalletButtonProps = {
  className?: string;
  size?: ComponentProps<typeof Button>["size"];
  variant?: ComponentProps<typeof Button>["variant"];
};

export function ConnectWalletButton({
  className,
  size = "default",
  variant = "default",
}: ConnectWalletButtonProps) {
  const { open } = useAppKit();
  const { connectingWallet, loading } = useAppKitState();
  const pendingLabel = connectingWallet?.name ?? "wallet";
  const isPending = loading || Boolean(connectingWallet);

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={isPending}
        onClick={() => {
          void open({ view: "Connect" });
        }}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Connecting {pendingLabel}
          </>
        ) : (
          <>
            <Wallet className="size-4" />
            Connect wallet
          </>
        )}
      </Button>
    </div>
  );
}
