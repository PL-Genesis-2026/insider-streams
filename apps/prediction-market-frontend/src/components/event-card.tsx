import type { PredictionEventsQuery } from "@/__generated__/graphql";

type EventCreatedItem = PredictionEventsQuery["eventCreateds"][number];
type SettlementResponseItem = PredictionEventsQuery["settlementResponses"][number];

type EventCardProps = {
  event: EventCreatedItem;
  settlement?: SettlementResponseItem;
  href?: string;
};

function outcomeLabel(outcome: number): string {
  switch (outcome) {
    case 1:
      return "Yes";
    case 2:
      return "No";
    default:
      return "Unresolved";
  }
}

function outcomeBadgeClass(outcome: number): string {
  switch (outcome) {
    case 1:
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case 2:
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  }
}

function statusLabel(event: EventCreatedItem, settlement?: SettlementResponseItem): string {
  if (settlement) return "Settled";
  const closeTime = Number(event.eventClose) * 1000;
  if (Date.now() > closeTime) return "Closed";
  return "Open";
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "Open":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "Closed":
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    case "Settled":
      return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
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
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-5 transition-colors hover:border-gray-600 hover:bg-gray-750">
      {/* Header: question + badges */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug text-white">
          {event.question}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}
          >
            {status}
          </span>
          {settlement && (
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${outcomeBadgeClass(settlement.outcome)}`}
            >
              {outcomeLabel(settlement.outcome)}
            </span>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
        <span>Event #{event.eventId}</span>
        <span>Creator: {shortenAddress(event.creator)}</span>
        <span>Created: {formatDate(event.blockTimestamp)}</span>
        {event.eventClose !== "0" && (
          <span>Closes: {formatDate(event.eventClose)}</span>
        )}
      </div>

      {/* Settlement info */}
      {settlement && (
        <div className="mt-3 rounded-md border border-gray-700 bg-gray-900/50 px-3 py-2 text-xs text-gray-300">
          Settled at {formatDate(settlement.blockTimestamp)} &mdash; Outcome:{" "}
          <span className="font-semibold text-white">
            {outcomeLabel(settlement.outcome)}
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return <a href={href} className="block">{content}</a>;
  }

  return content;
}
