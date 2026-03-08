"use client";

import { Wallet } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openAppKitConnectModal } from "@/lib/wallet/config";

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
  return (
    <div className={cn("space-y-2", className)}>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={() => {
          void openAppKitConnectModal();
        }}
      >
        <Wallet className="size-4" />
        Connect wallet
      </Button>
    </div>
  );
}
