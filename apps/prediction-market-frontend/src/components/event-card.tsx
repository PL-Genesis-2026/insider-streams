import type { PredictionEventsQuery } from "@/__generated__/graphql";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type EventCreatedItem = PredictionEventsQuery["eventCreateds"][number];
type SettlementResponseItem =
  PredictionEventsQuery["settlementResponses"][number];

type EventCardProps = {
  event: EventCreatedItem;
  settlement?: SettlementResponseItem;
  href?: string;
};

function outcomeLabel(outcome: number): string {
  switch (outcome) {
    case 1:
      return "No";
    case 2:
      return "Yes";
    case 3:
      return "Inconclusive";
    default:
      return "Unknown";
  }
}

function outcomeBadgeClass(outcome: number): string {
  switch (outcome) {
    case 2:
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-400";
    case 1:
      return "border-rose-500/30 bg-rose-500/15 text-rose-400";
    case 3:
      return "border-yellow-500/30 bg-yellow-500/15 text-yellow-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusLabel(
  event: EventCreatedItem,
  settlement?: SettlementResponseItem,
): string {
  if (settlement) return "Settled";
  const closeTime = Number(event.eventClose) * 1000;
  if (Date.now() > closeTime) return "Closed";
  return "Open";
}

function formatDate(unixSeconds: string): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleString();
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function EventCard({ event, settlement, href }: EventCardProps) {
  const status = statusLabel(event, settlement);

  const content = (
    <div
      className={cn(
        "rounded-[calc(var(--radius)+6px)] border bg-card p-5 transition-colors",
        href && "hover:border-accent/30 hover:bg-card/80",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug text-card-foreground">
          {event.question}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant={
              status === "Open"
                ? "accent"
                : status === "Settled"
                  ? "default"
                  : "muted"
            }
            className="text-[0.65rem]"
          >
            {status}
          </Badge>
          {settlement && (
            <Badge
              variant="outline"
              className={cn("text-[0.65rem]", outcomeBadgeClass(settlement.outcome))}
            >
              {outcomeLabel(settlement.outcome)}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Event #{event.eventId}</span>
        <span>Creator: {shortenAddress(event.creator)}</span>
        <span>Created: {formatDate(event.blockTimestamp)}</span>
        {event.eventClose !== "0" && (
          <span>Closes: {formatDate(event.eventClose)}</span>
        )}
      </div>

      {settlement && (
        <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Settled at {formatDate(settlement.blockTimestamp)} &mdash; Outcome:{" "}
          <span className="font-semibold text-foreground">
            {outcomeLabel(settlement.outcome)}
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }

  return content;
}
