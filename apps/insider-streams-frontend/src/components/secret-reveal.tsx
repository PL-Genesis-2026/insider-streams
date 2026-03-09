"use client";

import { useCallback, useState } from "react";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { useAccount } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PrivateSecretState } from "@/lib/private-data/types";
import { usePrivateData } from "@/lib/private-data/use-private-data";
import { cn } from "@/lib/utils";
import { openAppKitConnectModal } from "@/lib/wallet/config";

type SecretRevealCardProps = {
  auctionId: string;
};

function BlurredSkeleton() {
  return (
    <div className="select-none" aria-hidden>
      <div className="space-y-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/40">
          Secret data
        </span>
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-muted-foreground/8" />
          <div className="h-4 w-3/4 rounded bg-muted-foreground/8" />
        </div>
      </div>
      <div className="my-5 border-t border-border/40" />
      <div className="h-10 w-full rounded-md border border-border/40 bg-muted-foreground/5" />
    </div>
  );
}

function RevealedContent({
  data,
}: {
  data: Extract<PrivateSecretState, { kind: "accessible" }>;
}) {
  const outcome = data.event_data?.outcome;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
          Secret data
        </span>
        {outcome ? (
          <Badge
            variant="outline"
            className={cn(
              "border-current/20 bg-background/70",
              outcome === "yes" ? "text-emerald-400" : "text-rose-400",
            )}
          >
            Bet {outcome.toUpperCase()}
          </Badge>
        ) : null}
      </div>
      <p className="text-sm leading-7 text-foreground">{data.secret_data}</p>
      <p className="text-sm text-muted-foreground">
        {outcome
          ? `Use this signal to bet ${outcome.toUpperCase()} on the linked prediction market.`
          : "This secret was revealed, but the market side was not attached to the record."}
      </p>
    </div>
  );
}

export function SecretRevealCard({ auctionId }: SecretRevealCardProps) {
  const [hidden, setHidden] = useState(false);
  const { isConnected } = useAccount();
  const {
    getSecretState,
    revealForAuctions,
    isLoading,
    error,
    isRevealed: isSessionRevealed,
  } = usePrivateData();

  const secretState = getSecretState(auctionId);

  const handleConnect = useCallback(() => {
    void openAppKitConnectModal();
  }, []);

  const handleReveal = useCallback(() => {
    setHidden(false);
    void revealForAuctions([auctionId]);
  }, [auctionId, revealForAuctions]);

  const handleHide = useCallback(() => {
    setHidden(true);
  }, []);

  if (secretState?.kind === "accessible" && !hidden) {
    return (
      <div>
        <RevealedContent data={secretState} />
        <div className="mt-5 flex justify-center">
          <Button variant="ghost" size="sm" onClick={handleHide}>
            <EyeOff className="size-3.5" />
            Hide secret
          </Button>
        </div>
      </div>
    );
  }

  if (!isLoading && secretState?.kind === "forbidden") {
    return (
      <p className="text-sm leading-7 text-muted-foreground">
        This secret exists, but only the seller and the winning bidder can view
        it.
      </p>
    );
  }

  if (!isLoading && secretState?.kind === "not_found") {
    return (
      <p className="text-sm leading-7 text-muted-foreground">
        No secret record is available for this auction.
      </p>
    );
  }

  if (isSessionRevealed && error && !secretState && !isLoading) {
    return <p className="text-sm leading-7 text-destructive">{error}</p>;
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "blur-[6px] transition-[filter] duration-300",
          isLoading && "blur-[3px]",
        )}
      >
        <BlurredSkeleton />
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        {error && <p className="text-xs text-destructive">{error}</p>}

        {!isConnected ? (
          <Button variant="outline" size="sm" onClick={handleConnect}>
            <Lock className="size-3.5" />
            Connect wallet to reveal
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReveal}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Eye className="size-3.5" />
            )}
            {isLoading ? "Revealing..." : "Reveal secret"}
          </Button>
        )}
      </div>
    </div>
  );
}
