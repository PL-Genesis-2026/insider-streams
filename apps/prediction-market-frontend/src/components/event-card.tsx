"use client";

import Link from "next/link";
import type { PredictionEventsQuery } from "@/__generated__/graphql";
import { Badge } from "@/components/ui/badge";
import { DualProgress } from "@/components/ui/progress";
import { Countdown } from "@/components/countdown";
import {
  type EventVolume,
  type EventStatus,
  getEventStatus,
  formatUsdc,
  outcomeLabel,
} from "@/lib/market-utils";
import { cn } from "@/lib/utils";
import { Clock, Users, BarChart3, CheckCircle2, XCircle } from "lucide-react";

type EventCreatedItem = PredictionEventsQuery["eventCreateds"][number];
type SettlementResponseItem =
  PredictionEventsQuery["settlementResponses"][number];

type EventCardProps = {
  event: EventCreatedItem;
  settlement?: SettlementResponseItem;
  volume: EventVolume;
  href: string;
};

function StatusIndicator({ status }: { status: EventStatus }) {
  switch (status) {
    case "open":
      return (
        <Badge variant="accent" className="text-[0.6rem]">
          <span className="mr-0.5 inline-block size-1.5 animate-pulse rounded-full bg-current" />
          Live
        </Badge>
      );
    case "closed":
      return (
        <Badge variant="muted" className="text-[0.6rem]">
          Closed
        </Badge>
      );
    case "settling":
      return (
        <Badge
          variant="outline"
          className="border-yellow-500/30 bg-yellow-500/10 text-[0.6rem] text-yellow-400"
        >
          Settling
        </Badge>
      );
    case "settled":
      return (
        <Badge variant="muted" className="text-[0.6rem]">
          Settled
        </Badge>
      );
  }
}

function OutcomeBadge({ outcome }: { outcome: number }) {
  const label = outcomeLabel(outcome);
  if (outcome === 2) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/15 text-[0.6rem] text-emerald-400"
      >
        <CheckCircle2 className="size-2.5" />
        {label}
      </Badge>
    );
  }
  if (outcome === 1) {
    return (
      <Badge
        variant="outline"
        className="border-rose-500/30 bg-rose-500/15 text-[0.6rem] text-rose-400"
      >
        <XCircle className="size-2.5" />
        {label}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-yellow-500/30 bg-yellow-500/15 text-[0.6rem] text-yellow-400"
    >
      {label}
    </Badge>
  );
}

export function EventCard({ event, settlement, volume, href }: EventCardProps) {
  const status = getEventStatus(event, settlement);
  const closeTime = Number(event.eventClose);
  const hasVolume = volume.totalUsdc > BigInt(0);

  return (
    <Link href={href} className="group block">
      <div
        className={cn(
          "flex h-full flex-col rounded-[calc(var(--radius)+4px)] border bg-card p-5 transition-all duration-200",
          "hover:border-accent/25 hover:bg-card/90 hover:shadow-[0_8px_32px_rgba(91,138,240,0.06)]",
          status === "open" && "border-accent/10",
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-[0.9rem] font-semibold leading-snug text-card-foreground group-hover:text-foreground">
            {event.question}
          </h3>
          <div className="flex shrink-0 items-center gap-1.5">
            {settlement && <OutcomeBadge outcome={settlement.outcome} />}
            <StatusIndicator status={status} />
          </div>
        </div>

        {hasVolume && (
          <div className="mb-3.5">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-emerald-400">
                Yes {volume.yesPercent.toFixed(0)}%
              </span>
              <span className="font-medium text-rose-400">
                {volume.noPercent.toFixed(0)}% No
              </span>
            </div>
            <DualProgress yesPercent={volume.yesPercent} />
          </div>
        )}

        {!hasVolume && !settlement && (
          <div className="mb-3.5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Yes 50%</span>
              <span>50% No</span>
            </div>
            <DualProgress yesPercent={50} className="opacity-40" />
          </div>
        )}

        <div className="mt-auto flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BarChart3 className="size-3" />
            {hasVolume ? `$${formatUsdc(volume.totalUsdc)}` : "$0"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" />
            {volume.traderCount}
          </span>
          {status === "open" && closeTime > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-accent/80">
              <Clock className="size-3" />
              <Countdown targetUnix={closeTime} />
            </span>
          )}
          {status !== "open" && (
            <span className="ml-auto text-muted-foreground/60">
              #{event.eventId}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
