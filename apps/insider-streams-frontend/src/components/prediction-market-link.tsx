"use client";

import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { EXAMPLE_PREDICTION_MARKET_NAME } from "@private-streams/common";
import { env } from "@/env";
import { cn } from "@/lib/utils";

function buildPredictionMarketEventUrl(marketId: string): string {
  const baseUrl = env.NEXT_PUBLIC_EXTERNAL_PREDICTION_MARKET_BASE_URL;
  return `${baseUrl}/events/${marketId}`;
}

type PredictionMarketLinkProps = {
  marketId: string;
  eventTitle?: string;
  className?: string;
  variant?: "inline" | "card" | "button";
};

function InlineLink({
  href,
  marketId,
  className,
}: {
  href: string;
  marketId: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 font-serif text-[1.8rem] leading-none font-medium tracking-[-0.05em] text-foreground transition-colors hover:text-primary",
        className,
      )}
      title={`View Market #${marketId} on ${EXAMPLE_PREDICTION_MARKET_NAME}`}
    >
      #{marketId}
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

function CardLink({
  href,
  eventTitle,
  className,
}: {
  href: string;
  eventTitle?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex w-full items-center gap-3 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      <Image
        src="/ExternalPredictionMarketLogo.svg"
        alt={EXAMPLE_PREDICTION_MARKET_NAME}
        width={16}
        height={20}
        className="shrink-0"
      />
      <span className="min-w-0 flex-1 truncate">
        {eventTitle ?? EXAMPLE_PREDICTION_MARKET_NAME}
      </span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

function ButtonLink({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      <Image
        src="/ExternalPredictionMarketLogo.svg"
        alt={EXAMPLE_PREDICTION_MARKET_NAME}
        width={14}
        height={18}
        className="shrink-0"
      />
      View on {EXAMPLE_PREDICTION_MARKET_NAME}
    </a>
  );
}

export function PredictionMarketLink({
  marketId,
  eventTitle,
  className,
  variant = "inline",
}: PredictionMarketLinkProps) {
  const href = buildPredictionMarketEventUrl(marketId);

  switch (variant) {
    case "card":
      return (
        <CardLink href={href} eventTitle={eventTitle} className={className} />
      );
    case "button":
      return <ButtonLink href={href} className={className} />;
    case "inline":
      return (
        <InlineLink href={href} marketId={marketId} className={className} />
      );
  }
}
