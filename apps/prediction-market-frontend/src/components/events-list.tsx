"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@apollo/client/react";
import {
  PredictionEventsDocument,
  type PredictionEventsQuery,
} from "@/__generated__/graphql";
import { EventCard } from "@/components/event-card";
import {
  type EventVolume,
  getEventStatus,
  computeAllEventVolumes,
} from "@/lib/market-utils";
import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BarChart3, TrendingUp, Users, Activity } from "lucide-react";

type EventCreatedItem = PredictionEventsQuery["eventCreateds"][number];
type SettlementResponseItem =
  PredictionEventsQuery["settlementResponses"][number];
type SettlementRequestedItem =
  PredictionEventsQuery["settlementRequesteds"][number];

type FilterTab = "all" | "open" | "pending" | "settled";

const PAGE_SIZE = 50;

const EMPTY_VOLUME: EventVolume = {
  totalUsdc: BigInt(0),
  yesUsdc: BigInt(0),
  noUsdc: BigInt(0),
  yesPercent: null,
  noPercent: null,
  traderCount: 0,
  tradeCount: 0,
};

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Live" },
  { key: "pending", label: "Pending" },
  { key: "settled", label: "Settled" },
];

function sortEvents(
  events: readonly EventCreatedItem[],
  settlements: Map<string, SettlementResponseItem>,
  settlementRequests: Map<string, SettlementRequestedItem>,
): EventCreatedItem[] {
  function bucket(e: EventCreatedItem): number {
    const status = getEventStatus(
      e,
      settlements.get(String(e.eventId)),
      settlementRequests.get(String(e.eventId)),
    );
    if (status === "open") return 0;
    if (status === "settling" || status === "closed" || status === "manual") {
      return 1;
    }
    return 2;
  }

  return [...events].sort((a, b) => {
    const ba = bucket(a);
    const bb = bucket(b);
    if (ba !== bb) return ba - bb;
    return Number(b.blockTimestamp) - Number(a.blockTimestamp);
  });
}

type StatsBarProps = {
  eventCount: number;
  openCount: number;
  totalVolume: bigint;
  traderCount: number;
};

function StatsBar({ eventCount, openCount, totalVolume, traderCount }: StatsBarProps) {
  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border bg-card/60 px-4 py-3">
        <div className="mb-0.5 flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <TrendingUp className="size-3" />
          Markets
        </div>
        <div className="text-xl font-semibold text-foreground">{eventCount}</div>
      </div>
      <div className="rounded-xl border bg-card/60 px-4 py-3">
        <div className="mb-0.5 flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <Activity className="size-3" />
          Live
        </div>
        <div className="text-xl font-semibold text-emerald-400">{openCount}</div>
      </div>
      <div className="rounded-xl border bg-card/60 px-4 py-3">
        <div className="mb-0.5 flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <BarChart3 className="size-3" />
          Volume
        </div>
        <div className="text-xl font-semibold text-foreground">
          ${formatUsdc(totalVolume)}
        </div>
      </div>
      <div className="rounded-xl border bg-card/60 px-4 py-3">
        <div className="mb-0.5 flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <Users className="size-3" />
          Traders
        </div>
        <div className="text-xl font-semibold text-foreground">{traderCount}</div>
      </div>
    </div>
  );
}

export function EventsList() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const { data, loading, error } = useQuery(PredictionEventsDocument, {
    variables: { limit: PAGE_SIZE, skip: 0 },
    pollInterval: 15_000,
  });

  const settlementMap = useMemo(() => {
    const map = new Map<string, SettlementResponseItem>();
    for (const s of data?.settlementResponses ?? []) {
      map.set(String(s.eventId), s);
    }
    return map;
  }, [data?.settlementResponses]);

  const settlementRequestMap = useMemo(() => {
    const map = new Map<string, SettlementRequestedItem>();
    for (const s of data?.settlementRequesteds ?? []) {
      map.set(String(s.eventId), s);
    }
    return map;
  }, [data?.settlementRequesteds]);

  const volumeMap = useMemo(
    () => computeAllEventVolumes(data?.sharesPurchaseds ?? []),
    [data?.sharesPurchaseds],
  );

  const events = useMemo(
    () => data?.eventCreateds ?? [],
    [data?.eventCreateds],
  );
  const sortedEvents = useMemo(
    () => sortEvents(events, settlementMap, settlementRequestMap),
    [events, settlementMap, settlementRequestMap],
  );

  const stats = useMemo(() => {
    let totalVolume = BigInt(0);
    const allTraders = new Set<string>();
    let openCount = 0;

    for (const event of events) {
      const vol = volumeMap.get(String(event.eventId));
      if (vol) {
        totalVolume += vol.totalUsdc;
      }
      const status = getEventStatus(
        event,
        settlementMap.get(String(event.eventId)),
        settlementRequestMap.get(String(event.eventId)),
      );
      if (status === "open") openCount++;
    }

    for (const p of data?.sharesPurchaseds ?? []) {
      allTraders.add(p.buyer.toLowerCase());
    }

    return {
      eventCount: events.length,
      openCount,
      totalVolume,
      traderCount: allTraders.size,
    };
  }, [events, volumeMap, settlementMap, settlementRequestMap, data?.sharesPurchaseds]);

  const filteredEvents = useMemo(() => {
    if (activeFilter === "all") return sortedEvents;
    return sortedEvents.filter((event) => {
      const status = getEventStatus(
        event,
        settlementMap.get(String(event.eventId)),
        settlementRequestMap.get(String(event.eventId)),
      );
      if (activeFilter === "open") return status === "open";
      if (activeFilter === "pending") {
        return status === "closed" || status === "settling" || status === "manual";
      }
      if (activeFilter === "settled") return status === "settled";
      return true;
    });
  }, [sortedEvents, settlementMap, settlementRequestMap, activeFilter]);

  const filterCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = {
      all: sortedEvents.length,
      open: 0,
      pending: 0,
      settled: 0,
    };
    for (const event of sortedEvents) {
      const status = getEventStatus(
        event,
        settlementMap.get(String(event.eventId)),
        settlementRequestMap.get(String(event.eventId)),
      );
      if (status === "open") counts.open++;
      else if (status === "closed" || status === "settling" || status === "manual") {
        counts.pending++;
      }
      else if (status === "settled") counts.settled++;
    }
    return counts;
  }, [sortedEvents, settlementMap, settlementRequestMap]);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load events. Check that{" "}
        <code className="font-mono text-xs">NEXT_PUBLIC_SUBGRAPH_URL</code>{" "}
        points to the correct subgraph endpoint.
      </div>
    );
  }

  if (loading && !data) {
    return (
      <>
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-xl border bg-card/60" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-[calc(var(--radius)+4px)] border bg-card"
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <StatsBar {...stats} />

      <div className="mb-6 flex items-center gap-1 rounded-lg border bg-card/40 p-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveFilter(tab.key)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeFilter === tab.key
                ? "bg-accent/15 text-accent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            <span className="ml-1.5 text-[0.6rem] opacity-70">
              {filterCounts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <div className="rounded-[calc(var(--radius)+4px)] border bg-card p-8 text-center text-sm text-muted-foreground">
          No {activeFilter === "all" ? "" : activeFilter} markets found.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              settlement={settlementMap.get(String(event.eventId))}
              settlementRequest={settlementRequestMap.get(String(event.eventId))}
              volume={volumeMap.get(String(event.eventId)) ?? EMPTY_VOLUME}
              href={`/events/${event.eventId}`}
            />
          ))}
        </div>
      )}
    </>
  );
}
