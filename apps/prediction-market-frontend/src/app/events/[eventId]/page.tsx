"use client";

import { use, useState, useCallback, useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { EventDetailDocument } from "@/__generated__/graphql";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Clock,
  Users,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { BuySharesPanel } from "@/components/buy-shares-panel";
import { RedeemSharesPanel } from "@/components/redeem-shares-panel";
import { ActivityFeed } from "@/components/activity-feed";
import { Countdown } from "@/components/countdown";
import { DualProgress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  computeEventVolume,
  formatUsdc,
  formatDateTime,
  shortenAddress,
  getEventStatus,
  outcomeLabel,
} from "@/lib/market-utils";

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

  const purchases = useMemo(
    () => data?.sharesPurchaseds ?? [],
    [data?.sharesPurchaseds],
  );
  const redemptions = useMemo(
    () => data?.sharesRedeemeds ?? [],
    [data?.sharesRedeemeds],
  );

  const volume = useMemo(
    () => computeEventVolume(eventId, purchases),
    [eventId, purchases],
  );

  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settleTxHash, setSettleTxHash] = useState<string | null>(null);

  const [adminClosing, setAdminClosing] = useState(false);
  const [adminCloseError, setAdminCloseError] = useState<string | null>(null);
  const [adminCloseTxHash, setAdminCloseTxHash] = useState<string | null>(null);
  const [adminJustClosed, setAdminJustClosed] = useState(false);

  const eventStillOpen =
    Number(event?.eventClose) > 0 &&
    Date.now() < Number(event?.eventClose) * 1000;

  const status = event ? getEventStatus(event, settlement) : null;
  const isOpen = event && !settlement && eventStillOpen && !adminJustClosed;

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
      const json: Record<string, unknown> = await res.json();
      if (!res.ok) {
        setAdminCloseError(String(json.error ?? "Request failed"));
      } else {
        setAdminCloseTxHash(String(json.hash));
        setAdminJustClosed(true);
        void refetch();
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
      const json: Record<string, unknown> = await res.json();
      if (!res.ok) {
        setSettleError(String(json.error ?? "Request failed"));
      } else {
        setSettleTxHash(String(json.hash));
        void refetch();
      }
    } catch {
      setSettleError("Network error");
    } finally {
      setSettling(false);
    }
  }, [eventId, refetch]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8 md:px-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Markets
      </Link>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load event. Check that the subgraph is reachable.
        </div>
      )}

      {loading && !data && (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <div className="h-48 animate-pulse rounded-[calc(var(--radius)+4px)] border bg-card" />
            <div className="h-64 animate-pulse rounded-[calc(var(--radius)+4px)] border bg-card" />
          </div>
          <div className="h-80 animate-pulse rounded-[calc(var(--radius)+4px)] border bg-card" />
        </div>
      )}

      {!loading && !event && !error && (
        <div className="rounded-[calc(var(--radius)+4px)] border bg-card p-8 text-center text-sm text-muted-foreground">
          Event not found.
        </div>
      )}

      {event && (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            <div className="rounded-[calc(var(--radius)+4px)] border bg-card p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <h1 className="font-serif text-[1.6rem] font-medium leading-[1.1] tracking-[-0.03em] text-foreground md:text-[2rem]">
                  {event.question}
                </h1>
                <div className="flex shrink-0 items-center gap-1.5">
                  {settlement && (
                    <OutcomePill outcome={settlement.outcome} />
                  )}
                  <StatusPill status={status} />
                </div>
              </div>

              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-emerald-400">
                    Yes {volume.yesPercent.toFixed(1)}%
                  </span>
                  <span className="text-sm font-semibold text-rose-400">
                    {volume.noPercent.toFixed(1)}% No
                  </span>
                </div>
                <DualProgress yesPercent={volume.yesPercent} className="h-3 rounded-lg" />
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <BarChart3 className="size-3.5" />
                  <span className="font-medium text-foreground">
                    ${formatUsdc(volume.totalUsdc)}
                  </span>
                  volume
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  <span className="font-medium text-foreground">
                    {volume.traderCount}
                  </span>
                  traders
                </span>
                {status === "open" && Number(event.eventClose) > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-accent">
                    <Clock className="size-3.5" />
                    <Countdown targetUnix={Number(event.eventClose)} className="font-medium" />
                    remaining
                  </span>
                )}
              </div>
            </div>

            {canAdminClose && (
              <AdminClosePanel
                onClose={() => void handleAdminClose()}
                closing={adminClosing}
                error={adminCloseError}
                txHash={adminCloseTxHash}
              />
            )}

            {canSettle && (
              <SettlePanel
                onSettle={() => void handleSettle()}
                settling={settling}
                error={settleError}
                txHash={settleTxHash}
              />
            )}

            {settlementRequest && !settlement && (
              <div className="flex items-center gap-3 rounded-[calc(var(--radius)+4px)] border border-yellow-500/20 bg-yellow-500/5 px-5 py-4">
                <AlertTriangle className="size-4 shrink-0 text-yellow-400" />
                <div>
                  <div className="text-sm font-medium text-yellow-300">
                    Settlement in progress
                  </div>
                  <div className="mt-0.5 text-xs text-yellow-400/70">
                    CRE workflow is verifying the outcome via Gemini AI.
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-[calc(var(--radius)+4px)] border bg-card p-6">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Market Details
              </h2>
              <dl className="space-y-3 text-sm">
                <DetailRow label="Market ID" value={`#${event.eventId}`} />
                <DetailRow
                  label="Creator"
                  value={
                    <a
                      href={`https://sepolia.etherscan.io/address/${event.creator}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-accent underline-offset-4 hover:underline"
                    >
                      {shortenAddress(event.creator)}
                      <ExternalLink className="size-2.5" />
                    </a>
                  }
                />
                <DetailRow label="Opened" value={formatDateTime(event.eventOpen)} />
                <DetailRow
                  label="Closes"
                  value={
                    Number(event.eventClose) > 0
                      ? formatDateTime(event.eventClose)
                      : "N/A"
                  }
                />
                <DetailRow
                  label="Duration"
                  value={`${Math.round(Number(event.duration) / 60)} min`}
                />
                <DetailRow
                  label="Creation Tx"
                  value={
                    <TxLink hash={event.transactionHash} />
                  }
                />
                {event.yesToken && (
                  <DetailRow
                    label="Yes Token"
                    value={
                      <TokenLink address={event.yesToken} />
                    }
                  />
                )}
                {event.noToken && (
                  <DetailRow
                    label="No Token"
                    value={
                      <TokenLink address={event.noToken} />
                    }
                  />
                )}
                {settlement && (
                  <>
                    <div className="border-t border-border/50" />
                    <DetailRow
                      label="Settlement Tx"
                      value={<TxLink hash={settlement.transactionHash} />}
                    />
                    <DetailRow
                      label="Settled At"
                      value={formatDateTime(settlement.blockTimestamp)}
                    />
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Outcome</dt>
                      <dd>
                        <OutcomePill outcome={settlement.outcome} />
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>

            <div className="rounded-[calc(var(--radius)+4px)] border bg-card p-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Activity
              </h2>
              <ActivityFeed purchases={purchases} redemptions={redemptions} />
            </div>
          </div>

          <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
            {isOpen && <BuySharesPanel eventId={eventId} />}
            {settlement &&
              (settlement.outcome === 1 || settlement.outcome === 2) && (
                <RedeemSharesPanel
                  eventId={eventId}
                  outcome={settlement.outcome}
                />
              )}
            {!isOpen && !settlement && (
              <div className="rounded-[calc(var(--radius)+4px)] border bg-card p-6 text-center text-sm text-muted-foreground">
                {status === "closed"
                  ? "This market is closed. Trading is no longer available."
                  : "Trading is not available for this market."}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </div>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={`https://sepolia.etherscan.io/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-accent underline-offset-4 hover:underline"
    >
      {hash.slice(0, 10)}...{hash.slice(-6)}
      <ExternalLink className="size-2.5" />
    </a>
  );
}

function TokenLink({ address }: { address: string }) {
  return (
    <a
      href={`https://sepolia.etherscan.io/token/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-accent underline-offset-4 hover:underline"
    >
      {address.slice(0, 10)}...{address.slice(-6)}
      <ExternalLink className="size-2.5" />
    </a>
  );
}

function StatusPill({ status }: { status: string | null }) {
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
    case "settled":
      return (
        <Badge variant="muted" className="text-[0.6rem]">
          Settled
        </Badge>
      );
    default:
      return null;
  }
}

function OutcomePill({ outcome }: { outcome: number }) {
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

function AdminClosePanel({
  onClose,
  closing,
  error: closeError,
  txHash,
}: {
  onClose: () => void;
  closing: boolean;
  error: string | null;
  txHash: string | null;
}) {
  return (
    <div className="rounded-[calc(var(--radius)+4px)] border border-orange-500/20 bg-orange-500/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-orange-300">
            Admin: Close Event Early
          </div>
          <div className="mt-0.5 text-xs text-orange-400/60">
            Sets close time to now for immediate settlement.
          </div>
        </div>
        <Button
          onClick={onClose}
          disabled={closing}
          variant="outline"
          size="sm"
          className="border-orange-500/30 text-orange-300 hover:border-orange-500/50 hover:bg-orange-500/10"
        >
          {closing ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Closing...
            </>
          ) : (
            "Admin Close"
          )}
        </Button>
      </div>
      {closeError && (
        <div className="mt-2 text-xs text-destructive">{closeError}</div>
      )}
      {txHash && (
        <div className="mt-2 text-xs text-emerald-400">
          Event closed! <TxLink hash={txHash} />
        </div>
      )}
    </div>
  );
}

function SettlePanel({
  onSettle,
  settling,
  error: settleError,
  txHash,
}: {
  onSettle: () => void;
  settling: boolean;
  error: string | null;
  txHash: string | null;
}) {
  return (
    <div className="rounded-[calc(var(--radius)+4px)] border border-accent/20 bg-accent/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Market closed — ready for settlement via Chainlink CRE.
        </div>
        <Button
          onClick={onSettle}
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
            "Settle"
          )}
        </Button>
      </div>
      {settleError && (
        <div className="mt-2 text-xs text-destructive">{settleError}</div>
      )}
      {txHash && (
        <div className="mt-2 text-xs text-emerald-400">
          Settlement requested! <TxLink hash={txHash} />
        </div>
      )}
    </div>
  );
}
