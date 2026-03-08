"use client";

import { use, useState, useCallback } from "react";
import { useQuery } from "@apollo/client/react";
import { EventDetailDocument } from "@/__generated__/graphql";
import { EventCard } from "@/components/event-card";

type Params = Promise<{ eventId: string }>;

export default function EventDetailPage({ params }: { params: Params }) {
  const { eventId } = use(params);

  const { data, loading, error, refetch } = useQuery(EventDetailDocument, {
    variables: { eventId },
    pollInterval: 10_000,
  });

  const event = data?.eventCreateds?.[0];
  const settlement = data?.settlementResponses?.[0];
  const settlementRequest = data?.settlementRequesteds?.[0];

  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settleTxHash, setSettleTxHash] = useState<string | null>(null);

  const [adminClosing, setAdminClosing] = useState(false);
  const [adminCloseError, setAdminCloseError] = useState<string | null>(null);
  const [adminCloseTxHash, setAdminCloseTxHash] = useState<string | null>(null);
  // Track when we've just admin-closed so the settle button appears immediately
  // (subgraph eventClose is immutable and won't reflect the on-chain change)
  const [adminJustClosed, setAdminJustClosed] = useState(false);

  const eventStillOpen =
    Number(event?.eventClose) > 0 &&
    Date.now() < Number(event?.eventClose) * 1000;

  const canAdminClose =
    event &&
    !settlement &&
    !settlementRequest &&
    !adminJustClosed &&
    eventStillOpen;

  const canSettle =
    event &&
    !settlement &&
    !settlementRequest &&
    Number(event.eventClose) > 0 &&
    (adminJustClosed || Date.now() > Number(event.eventClose) * 1000);

  const handleAdminClose = useCallback(async () => {
    setAdminClosing(true);
    setAdminCloseError(null);
    setAdminCloseTxHash(null);
    try {
      const res = await fetch("/api/admin-close-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAdminCloseError(json.error ?? "Request failed");
      } else {
        setAdminCloseTxHash(json.hash);
        setAdminJustClosed(true);
        refetch();
      }
    } catch {
      setAdminCloseError("Network error");
    } finally {
      setAdminClosing(false);
    }
  }, [eventId, refetch]);

  const handleSettle = useCallback(async () => {
    setSettling(true);
    setSettleError(null);
    setSettleTxHash(null);
    try {
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSettleError(json.error ?? "Request failed");
      } else {
        setSettleTxHash(json.hash);
        refetch();
      }
    } catch {
      setSettleError("Network error");
    } finally {
      setSettling(false);
    }
  }, [eventId, refetch]);

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

          {/* Admin close action (debug) */}
          {canAdminClose && (
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-orange-300">Debug: Admin Close Event</div>
                  <div className="text-xs text-orange-400/70 mt-0.5">
                    Sets eventClose to now so settlement can proceed immediately.
                  </div>
                </div>
                <button
                  onClick={handleAdminClose}
                  disabled={adminClosing}
                  className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adminClosing ? "Closing..." : "Admin Close"}
                </button>
              </div>
              {adminCloseError && (
                <div className="mt-2 text-xs text-red-400">{adminCloseError}</div>
              )}
              {adminCloseTxHash && (
                <div className="mt-2 text-xs text-green-400">
                  Event closed! Tx:{" "}
                  <span className="font-mono">{adminCloseTxHash}</span>
                </div>
              )}
            </div>
          )}

          {/* Settle action */}
          {canSettle && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-blue-300">
                  This event has closed and can be settled.
                </div>
                <button
                  onClick={handleSettle}
                  disabled={settling}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {settling ? "Requesting..." : "Settle now"}
                </button>
              </div>
              {settleError && (
                <div className="mt-2 text-xs text-red-400">{settleError}</div>
              )}
              {settleTxHash && (
                <div className="mt-2 text-xs text-green-400">
                  Settlement requested! Tx:{" "}
                  <span className="font-mono">{settleTxHash}</span>
                </div>
              )}
            </div>
          )}

          {/* Settlement pending indicator */}
          {settlementRequest && !settlement && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-300">
              <div>Settlement requested — waiting for CRE workflow to resolve...</div>
              <div className="mt-1 font-mono text-xs text-yellow-400/70">
                Tx: {settlementRequest.transactionHash}
              </div>
            </div>
          )}

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
