"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { ExternalLink, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { EXAMPLE_PREDICTION_MARKET_NAME } from "@private-streams/common";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import type { EventData } from "@/lib/supabase/secrets";
import { cn } from "@/lib/utils";

type SecretRevealCardProps = {
  auctionId: string;
};

type RevealedSecret = {
  secret_data: string;
  event_data: EventData | null;
};

type RevealState =
  | { status: "hidden" }
  | { status: "loading" }
  | { status: "revealed"; data: RevealedSecret }
  | { status: "error"; message: string };

function BlurredSkeleton() {
  return (
    <div className="select-none" aria-hidden>
      {/* Blurred secret_data placeholder */}
      <div className="space-y-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/40">
          Secret data
        </span>
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-muted-foreground/8" />
          <div className="h-4 w-3/4 rounded bg-muted-foreground/8" />
        </div>
      </div>

      {/* Divider */}
      <div className="my-5 border-t border-border/40" />

      {/* Blurred market link placeholder */}
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

function RevealedContent({ data }: { data: RevealedSecret }) {
  return (
    <div>
      {/* secret_data */}
      <div className="space-y-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
          Secret data
        </span>
        <p className="text-sm leading-7 text-foreground">{data.secret_data}</p>
      </div>

      {/* Market link button */}
      {data.event_data && (
        <>
          <div className="my-5 border-t border-border/40" />
          <MarketLink eventData={data.event_data} />
        </>
      )}
    </div>
  );
}

export function SecretRevealCard({
  auctionId,
}: SecretRevealCardProps) {
  const [state, setState] = useState<RevealState>({ status: "hidden" });

  const handleReveal = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const res = await fetch(
        `/api/secrets?ids=${encodeURIComponent(auctionId)}`,
      );

      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }

      const json = await res.json();
      const row = json.data?.[0];

      if (!row) {
        setState({ status: "error", message: "Secret not found" });
        return;
      }

      setState({
        status: "revealed",
        data: {
          secret_data: row.secret_data,
          event_data: row.event_data,
        },
      });
    } catch {
      setState({
        status: "error",
        message: "Failed to load secret. Please try again.",
      });
    }
  }, [auctionId]);

  const handleHide = useCallback(() => {
    setState({ status: "hidden" });
  }, []);

  if (state.status === "revealed") {
    return (
      <div>
        <RevealedContent data={state.data} />
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
      {/* Blurred skeleton behind the overlay */}
      <div
        className={cn(
          "blur-[6px] transition-[filter] duration-300",
          state.status === "loading" && "blur-[3px]",
        )}
      >
        <BlurredSkeleton />
      </div>

      {/* Centered overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        {state.status === "error" && (
          <p className="text-xs text-destructive">{state.message}</p>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleReveal}
          disabled={state.status === "loading"}
        >
          {state.status === "loading" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Eye className="size-3.5" />
          )}
          {state.status === "loading" ? "Revealing..." : "Reveal secret"}
        </Button>
      </div>
    </div>
  );
}
