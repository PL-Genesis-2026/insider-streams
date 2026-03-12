"use client";

import Link from "next/link";
import type { PredictionEventsQuery } from "@/__generated__/graphql";
import { DualProgress } from "@/components/ui/progress";
import { OutcomeBadge } from "@/components/outcome-badge";
import { StatusBadge } from "@/components/status-badge";
import { Countdown } from "@/components/countdown";
import { type EventVolume, getEventStatus } from "@/lib/market-utils";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Clock, Users, BarChart3 } from "lucide-react";

type EventCreatedItem = PredictionEventsQuery["eventCreateds"][number];
type SettlementResponseItem =
  PredictionEventsQuery["settlementResponses"][number];
type SettlementRequestedItem =
  PredictionEventsQuery["settlementRequesteds"][number];

type EventCardProps = {
  event: EventCreatedItem;
  settlement?: SettlementResponseItem;
  settlementRequest?: SettlementRequestedItem;
  volume: EventVolume;
  href: string;
};

export function EventCard({
  event,
  settlement,
  settlementRequest,
  volume,
  href,
}: EventCardProps) {
  const status = getEventStatus(event, settlement, settlementRequest);
  const closeTime = Number(event.eventClose);
  const hasTrades = volume.yesPercent !== null;

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
            <StatusBadge status={status} />
          </div>
        </div>

        {hasTrades && volume.yesPercent !== null && (
          <div className="mb-3.5">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-emerald-400">
                ${formatUsdc(volume.yesUsdc)} Yes
              </span>
              <span className="font-medium text-rose-400">
                No ${formatUsdc(volume.noUsdc)}
              </span>
            </div>
            <DualProgress yesPercent={volume.yesPercent} />
          </div>
        )}

        {!hasTrades && (
          <div className="mb-3.5 flex h-[30px] items-center text-xs text-muted-foreground/60">
            No trades yet
          </div>
        )}

        <div className="mt-auto flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BarChart3 className="size-3" />
            ${formatUsdc(volume.totalUsdc)}
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
