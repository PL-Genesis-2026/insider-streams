"use client";

import { use, useState, useCallback, useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { EventDetailDocument } from "@/__generated__/graphql";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Clock,
  Users,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import { BuySharesPanel } from "@/components/buy-shares-panel";
import { RedeemSharesPanel } from "@/components/redeem-shares-panel";
import { ActivityFeed } from "@/components/activity-feed";
import { Countdown } from "@/components/countdown";
import { DualProgress } from "@/components/ui/progress";
import { OutcomeBadge } from "@/components/outcome-badge";
import { StatusBadge } from "@/components/status-badge";
import { EtherscanLink } from "@/components/etherscan-link";
import { Button } from "@/components/ui/button";
import {
  OUTCOME,
  MARKET_STATUS,
  computeEventVolume,
  getEventStatus,
  type EventStatus,
} from "@/lib/market-utils";
import { formatUsdc, formatDateTime } from "@/lib/format";

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

  const status: EventStatus | null = event
    ? getEventStatus(event, settlement, settlementRequest)
    : null;
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

  const hasVolumeData = volume.yesPercent !== null;

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
                    <OutcomeBadge outcome={settlement.outcome} />
                  )}
                  {status && <StatusBadge status={status} />}
                </div>
              </div>

              {hasVolumeData && volume.yesPercent !== null && (
                <div className="mb-5">
                  <div className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Bet distribution
                  </div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-emerald-400">
                      ${formatUsdc(volume.yesUsdc)} Yes
                    </span>
                    <span className="text-sm font-semibold text-rose-400">
                      No ${formatUsdc(volume.noUsdc)}
                    </span>
                  </div>
                  <DualProgress yesPercent={volume.yesPercent} className="h-3 rounded-lg" />
                </div>
              )}

              {!hasVolumeData && (
                <div className="mb-5 text-sm text-muted-foreground/60">
                  No trades yet.
                </div>
              )}

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

            {settlement?.status === MARKET_STATUS.NeedsManual && (
              <div className="flex items-center gap-3 rounded-[calc(var(--radius)+4px)] border border-orange-500/20 bg-orange-500/5 px-5 py-4">
                <AlertTriangle className="size-4 shrink-0 text-orange-300" />
                <div>
                  <div className="text-sm font-medium text-orange-200">
                    Manual settlement required
                  </div>
                  <div className="mt-0.5 text-xs text-orange-200/70">
                    CRE returned an inconclusive outcome. This market still needs
                    a manual resolution before winnings can be redeemed.
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
                  value={<EtherscanLink type="address" value={event.creator} />}
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
                  value={<EtherscanLink type="tx" value={event.transactionHash} />}
                />
                {event.yesToken && (
                  <DetailRow
                    label="Yes Token"
                    value={<EtherscanLink type="token" value={event.yesToken} />}
                  />
                )}
                {event.noToken && (
                  <DetailRow
                    label="No Token"
                    value={<EtherscanLink type="token" value={event.noToken} />}
                  />
                )}
                {settlement && (
                  <>
                    <div className="border-t border-border/50" />
                    <DetailRow
                      label="Settlement Tx"
                      value={<EtherscanLink type="tx" value={settlement.transactionHash} />}
                    />
                    <DetailRow
                      label="Settled At"
                      value={formatDateTime(settlement.blockTimestamp)}
                    />
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Outcome</dt>
                      <dd>
                        <OutcomeBadge outcome={settlement.outcome} />
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
              (settlement.outcome === OUTCOME.No || settlement.outcome === OUTCOME.Yes) && (
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
          Event closed! <EtherscanLink type="tx" value={txHash} />
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
          Settlement requested! <EtherscanLink type="tx" value={txHash} />
        </div>
      )}
    </div>
  );
}
