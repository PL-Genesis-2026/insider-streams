"use client";

import type { EventDetailQuery } from "@/__generated__/graphql";
import { formatUsdc, formatShares, formatDateTime, outcomeLabel } from "@/lib/format";
import { OUTCOME, SEPOLIA_EXPLORER_URL } from "@/lib/market-utils";
import { formatAddress } from "@/lib/wallet/format-address";
import { ExternalLink, TrendingUp, TrendingDown, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

type SharesPurchasedItem = EventDetailQuery["sharesPurchaseds"][number];
type SharesRedeemedItem = EventDetailQuery["sharesRedeemeds"][number];

type ActivityItem =
  | { type: "purchase"; data: SharesPurchasedItem }
  | { type: "redeem"; data: SharesRedeemedItem };

type ActivityFeedProps = {
  purchases: readonly SharesPurchasedItem[];
  redemptions: readonly SharesRedeemedItem[];
};

export function ActivityFeed({ purchases, redemptions }: ActivityFeedProps) {
  const items: ActivityItem[] = [
    ...purchases.map(
      (data): ActivityItem => ({ type: "purchase", data }),
    ),
    ...redemptions.map(
      (data): ActivityItem => ({ type: "redeem", data }),
    ),
  ].sort((a, b) => Number(b.data.blockTimestamp) - Number(a.data.blockTimestamp));

  if (items.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        No trading activity yet.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {items.map((item) => {
        if (item.type === "purchase") {
          const p = item.data;
          const isYes = p.outcome === OUTCOME.Yes;
          return (
            <div key={p.id} className="flex items-center gap-3 py-3">
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  isYes
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-rose-500/15 text-rose-400",
                )}
              >
                {isYes ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 text-sm">
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {formatAddress(p.buyer)}
                  </span>
                  <span className="text-muted-foreground">bought</span>
                  <span
                    className={cn(
                      "font-semibold",
                      isYes ? "text-emerald-400" : "text-rose-400",
                    )}
                  >
                    {outcomeLabel(p.outcome)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground/70">
                  <span>${formatUsdc(BigInt(p.usdcIn))} USDC</span>
                  <span>{formatShares(p.sharesOut)} shares</span>
                  <span className="ml-auto">{formatDateTime(p.blockTimestamp)}</span>
                </div>
              </div>
              <a
                href={`${SEPOLIA_EXPLORER_URL}/tx/${p.transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted-foreground/40 transition-colors hover:text-accent"
              >
                <ExternalLink className="size-3" />
              </a>
            </div>
          );
        }

        const r = item.data;
        return (
          <div key={r.id} className="flex items-center gap-3 py-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Coins className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 text-sm">
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {formatAddress(r.redeemer)}
                </span>
                <span className="text-muted-foreground">redeemed</span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground/70">
                <span>{formatShares(r.sharesIn)} shares</span>
                <span>${formatUsdc(BigInt(r.usdcOut))} USDC</span>
                <span className="ml-auto">{formatDateTime(r.blockTimestamp)}</span>
              </div>
            </div>
            <a
              href={`${SEPOLIA_EXPLORER_URL}/tx/${r.transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-muted-foreground/40 transition-colors hover:text-accent"
            >
              <ExternalLink className="size-3" />
            </a>
          </div>
        );
      })}
    </div>
  );
}
