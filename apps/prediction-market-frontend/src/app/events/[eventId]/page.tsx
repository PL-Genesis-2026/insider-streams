"use client";

import { use } from "react";
import { useQuery } from "@apollo/client/react";
import { EventDetailDocument } from "@/__generated__/graphql";
import { EventCard } from "@/components/event-card";

type Params = Promise<{ eventId: string }>;

export default function EventDetailPage({ params }: { params: Params }) {
  const { eventId } = use(params);

  const { data, loading, error } = useQuery(EventDetailDocument, {
    variables: { eventId },
  });

  const event = data?.eventCreateds?.[0];
  const settlement = data?.settlementResponses?.[0];
  const settlementRequest = data?.settlementRequesteds?.[0];

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <a
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-white"
      >
        &larr; Back to events
      </a>

      <h1 className="mb-8 text-3xl font-bold text-white">
        Event #{eventId}
      </h1>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          Failed to load event. Check that the subgraph is reachable.
        </div>
      )}

      {loading && !data && (
        <div className="h-32 animate-pulse rounded-lg border border-gray-700 bg-gray-800" />
      )}

      {!loading && !event && !error && (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-6 text-center text-sm text-gray-400">
          Event not found.
        </div>
      )}

      {event && (
        <div className="space-y-6">
          <EventCard event={event} settlement={settlement} />

          {/* Additional detail */}
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Details
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">Creator</dt>
                <dd className="font-mono text-gray-200">{event.creator}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Event Open</dt>
                <dd className="text-gray-200">
                  {new Date(Number(event.eventOpen) * 1000).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Event Close</dt>
                <dd className="text-gray-200">
                  {Number(event.eventClose) > 0
                    ? new Date(
                        Number(event.eventClose) * 1000,
                      ).toLocaleString()
                    : "N/A"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Duration</dt>
                <dd className="text-gray-200">
                  {Math.round(Number(event.duration) / 60)} min
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Creation Tx</dt>
                <dd className="font-mono text-xs text-gray-200">
                  {event.transactionHash}
                </dd>
              </div>
              {settlementRequest && (
                <>
                  <div className="border-t border-gray-700 pt-3" />
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Settlement Requested</dt>
                    <dd className="text-gray-200">
                      {new Date(
                        Number(settlementRequest.blockTimestamp) * 1000,
                      ).toLocaleString()}
                    </dd>
                  </div>
                </>
              )}
              {settlement && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Settlement Tx</dt>
                    <dd className="font-mono text-xs text-gray-200">
                      {settlement.transactionHash}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        </div>
      )}
    </main>
  );
}
