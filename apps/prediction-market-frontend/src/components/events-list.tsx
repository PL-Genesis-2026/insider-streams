"use client";

import { useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import {
  PredictionEventsDocument,
  type PredictionEventsQuery,
} from "@/__generated__/graphql";
import { EventCard } from "@/components/event-card";

type SettlementResponseItem =
  PredictionEventsQuery["settlementResponses"][number];

const PAGE_SIZE = 50;

export function EventsList() {
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
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-[calc(var(--radius)+6px)] border bg-card"
          />
        ))}
      </div>
    );
  }

  const events = data?.eventCreateds ?? [];

  if (events.length === 0) {
    return (
      <div className="rounded-[calc(var(--radius)+6px)] border bg-card p-6 text-center text-sm text-muted-foreground">
        No events found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          settlement={settlementMap.get(String(event.eventId))}
          href={`/events/${event.eventId}`}
        />
      ))}
    </div>
  );
}
