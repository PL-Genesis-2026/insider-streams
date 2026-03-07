"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { ExternalLink, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { EXAMPLE_PREDICTION_MARKET_NAME } from "@private-streams/common";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import type { EventData } from "@/lib/supabase/secrets";
import type { PrivateSecretRecord } from "@/lib/private-data/types";
import { usePrivateData } from "@/lib/private-data/use-private-data";
import { cn } from "@/lib/utils";

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

function MarketLink({ eventData }: { eventData: EventData }) {
  const baseUrl = env.NEXT_PUBLIC_EXTERNAL_PREDICTION_MARKET_BASE_URL;
  const href = `${baseUrl}/events/${eventData.marketId}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full items-center gap-3 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Image
        src="/ExternalPredictionMarketLogo.svg"
        alt={EXAMPLE_PREDICTION_MARKET_NAME}
        width={16}
        height={20}
        className="shrink-0"
      />
      <span className="min-w-0 flex-1 truncate">{eventData.event}</span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

function RevealedContent({ data }: { data: PrivateSecretRecord }) {
  return (
    <div>
      <div className="space-y-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
          Secret data
        </span>
        <p className="text-sm leading-7 text-foreground">{data.secret_data}</p>
      </div>
      {data.event_data && (
        <>
          <div className="my-5 border-t border-border/40" />
          <MarketLink eventData={data.event_data} />
        </>
      )}
    </div>
  );
}

export function SecretRevealCard({ auctionId }: SecretRevealCardProps) {
  const [hidden, setHidden] = useState(false);
  const { isConnected } = useAccount();
  const { open } = useAppKit();
  const { getSecret, revealForAuctions, isLoading, error } = usePrivateData();

  const secret = getSecret(auctionId);
  const isRevealed = !!secret && !hidden;

  const handleConnect = useCallback(() => {
    void open({ view: "Connect" });
  }, [open]);

  const handleReveal = useCallback(() => {
    setHidden(false);
    void revealForAuctions([auctionId]);
  }, [auctionId, revealForAuctions]);

  const handleHide = useCallback(() => {
    setHidden(true);
  }, []);

  if (isRevealed) {
    return (
      <div>
        <RevealedContent data={secret} />
        <div className="mt-5 flex justify-center">
          <Button variant="ghost" size="sm" onClick={handleHide}>
            <EyeOff className="size-3.5" />
            Hide secret
          </Button>
        </div>
      </div>
    );
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
