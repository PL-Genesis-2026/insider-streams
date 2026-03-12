"use client";

import { Wallet } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { ensureAppKit, walletEnabled } from "@/lib/wallet/config";
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
  if (!walletEnabled) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={() => {
          const appKit = ensureAppKit();
          if (!appKit) {
            return;
          }
          void appKit.open({ view: "Connect" });
        }}
      >
        <Wallet className="size-4" />
        Connect wallet
      </Button>
    </div>
  );
}
