"use client";

import { ArrowRightLeft, Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { requiredChain } from "@/lib/wallet/config";
import { cn } from "@/lib/utils";

type SwitchNetworkButtonProps = {
  className?: string;
  size?: ComponentProps<typeof Button>["size"];
  variant?: ComponentProps<typeof Button>["variant"];
  showError?: boolean;
};

export function SwitchNetworkButton({
  className,
  size = "default",
  variant = "outline",
  showError = false,
}: SwitchNetworkButtonProps) {
  const { error, isPending, switchChain } = useSwitchChain();

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={isPending}
        onClick={() => {
          switchChain({ chainId: requiredChain.id });
        }}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Switching to {requiredChain.name}
          </>
        ) : (
          <>
            <ArrowRightLeft className="size-4" />
            Switch to {requiredChain.name}
          </>
        )}
      </Button>
      {showError && error ? (
        <p className="text-xs text-destructive">{error.message}</p>
      ) : null}
    </div>
  );
}
