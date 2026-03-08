"use client";

import { use, useState, useCallback } from "react";
import { useQuery } from "@apollo/client/react";
import { EventDetailDocument } from "@/__generated__/graphql";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { EventCard } from "@/components/event-card";
import { BuySharesPanel } from "@/components/buy-shares-panel";
import { RedeemSharesPanel } from "@/components/redeem-shares-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

  const isOpen =
    event &&
    !settlement &&
    Number(event.eventClose) > 0 &&
    Date.now() <= Number(event.eventClose) * 1000;

  const canSettle =
    event &&
    !settlement &&
    !settlementRequest &&
    Number(event.eventClose) > 0 &&
    Date.now() > Number(event.eventClose) * 1000;

  const isSettled = !!settlement;

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
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 md:px-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to events
      </Link>

      <h1 className="mb-8 font-serif text-[2.8rem] font-medium leading-[0.94] tracking-[-0.04em] text-foreground">
        Event #{eventId}
      </h1>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load event. Check that the subgraph is reachable.
        </div>
      )}

      {loading && !data && (
        <div className="h-32 animate-pulse rounded-[calc(var(--radius)+6px)] border bg-card" />
      )}

      {!loading && !event && !error && (
        <div className="rounded-[calc(var(--radius)+6px)] border bg-card p-6 text-center text-sm text-muted-foreground">
          Event not found.
        </div>
      )}

      {event && (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <EventCard event={event} settlement={settlement} />

            {canSettle && (
              <div className="rounded-[calc(var(--radius)+6px)] border border-accent/25 bg-accent/5 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    This event has closed and can be settled.
                  </div>
                  <Button
                    onClick={() => void handleSettle()}
                    disabled={settling}
                    variant="accent"
                    size="sm"
                  >
                    {settling ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Requesting...
                      </>
                    ) : (
                      "Settle now"
                    )}
                  </Button>
                </div>
                {settleError && (
                  <div className="mt-2 text-xs text-destructive">
                    {settleError}
                  </div>
                )}
                {settleTxHash && (
                  <div className="mt-2 text-xs text-emerald-400">
                    Settlement requested!{" "}
                    <a
                      href={`https://sepolia.etherscan.io/tx/${settleTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline underline-offset-4"
                    >
                      {settleTxHash.slice(0, 10)}...{settleTxHash.slice(-6)}
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {settlementRequest && !settlement && (
              <div className="rounded-[calc(var(--radius)+6px)] border border-yellow-500/25 bg-yellow-500/5 p-4 text-sm text-yellow-300">
                Settlement requested — waiting for CRE workflow to resolve...
              </div>
            )}

            <div className="rounded-[calc(var(--radius)+6px)] border bg-card p-5">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Details
              </h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Creator</dt>
                  <dd className="truncate font-mono text-xs text-foreground">
                    {event.creator}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Event Open</dt>
                  <dd className="text-foreground">
                    {new Date(
                      Number(event.eventOpen) * 1000,
                    ).toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Event Close</dt>
                  <dd className="text-foreground">
                    {Number(event.eventClose) > 0
                      ? new Date(
                          Number(event.eventClose) * 1000,
                        ).toLocaleString()
                      : "N/A"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd className="text-foreground">
                    {Math.round(Number(event.duration) / 60)} min
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Creation Tx</dt>
                  <dd className="truncate font-mono text-xs text-foreground">
                    <a
                      href={`https://sepolia.etherscan.io/tx/${event.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent underline underline-offset-4 hover:text-accent/80"
                    >
                      {event.transactionHash.slice(0, 10)}...
                      {event.transactionHash.slice(-6)}
                      <ExternalLink className="size-3" />
                    </a>
                  </dd>
                </div>
                {event.yesToken && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Yes Token</dt>
                    <dd className="truncate font-mono text-xs text-foreground">
                      {event.yesToken.slice(0, 10)}...{event.yesToken.slice(-6)}
                    </dd>
                  </div>
                )}
                {event.noToken && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">No Token</dt>
                    <dd className="truncate font-mono text-xs text-foreground">
                      {event.noToken.slice(0, 10)}...{event.noToken.slice(-6)}
                    </dd>
                  </div>
                )}
                {settlementRequest && (
                  <>
                    <div className="border-t border-border/60 pt-3" />
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">
                        Settlement Requested
                      </dt>
                      <dd className="text-foreground">
                        {new Date(
                          Number(settlementRequest.blockTimestamp) * 1000,
                        ).toLocaleString()}
                      </dd>
                    </div>
                  </>
                )}
                {settlement && (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Settlement Tx</dt>
                      <dd className="truncate font-mono text-xs text-foreground">
                        <a
                          href={`https://sepolia.etherscan.io/tx/${settlement.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-accent underline underline-offset-4 hover:text-accent/80"
                        >
                          {settlement.transactionHash.slice(0, 10)}...
                          {settlement.transactionHash.slice(-6)}
                          <ExternalLink className="size-3" />
                        </a>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Outcome</dt>
                      <dd>
                        <Badge
                          variant="outline"
                          className={
                            settlement.outcome === 2
                              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                              : settlement.outcome === 1
                                ? "border-rose-500/30 bg-rose-500/15 text-rose-400"
                                : "border-yellow-500/30 bg-yellow-500/15 text-yellow-400"
                          }
                        >
                          {settlement.outcome === 2
                            ? "Yes"
                            : settlement.outcome === 1
                              ? "No"
                              : "Inconclusive"}
                        </Badge>
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          </div>

          <div className="space-y-6">
            {isOpen && (
              <BuySharesPanel eventId={eventId} />
            )}
            {isSettled &&
              settlement.outcome !== 3 && (
                <RedeemSharesPanel
                  eventId={eventId}
                  outcome={settlement.outcome}
                />
              )}
          </div>
        </div>
      )}
    </main>
  );
}
