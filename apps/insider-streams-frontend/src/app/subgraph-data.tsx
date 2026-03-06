"use client";

import { useSuspenseQuery } from "@apollo/client/react";
import {
  RecentAuctionsDocument,
  RecentBidsDocument,
  RecentClosedAuctionsDocument,
  RecentForceClosedAuctionsDocument,
} from "../__generated__/graphql";

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-zinc-200 dark:border-zinc-800">
      <h2 className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-900">
        {title}{" "}
        <span className="font-normal text-zinc-500">({count})</span>
      </h2>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
        {children}
      </pre>
    </section>
  );
}

export function AuctionsData() {
  const { data } = useSuspenseQuery(RecentAuctionsDocument);
  return (
    <Section title="Auctions Created" count={data.auctionCreateds.length}>
      {JSON.stringify(data.auctionCreateds, null, 2)}
    </Section>
  );
}

export function BidsData() {
  const { data } = useSuspenseQuery(RecentBidsDocument);
  return (
    <Section title="Bids Placed" count={data.bidPlaceds.length}>
      {JSON.stringify(data.bidPlaceds, null, 2)}
    </Section>
  );
}

export function ClosedAuctionsData() {
  const { data } = useSuspenseQuery(RecentClosedAuctionsDocument);
  return (
    <Section title="Auctions Closed" count={data.auctionCloseds.length}>
      {JSON.stringify(data.auctionCloseds, null, 2)}
    </Section>
  );
}

export function ForceClosedAuctionsData() {
  const { data } = useSuspenseQuery(RecentForceClosedAuctionsDocument);
  return (
    <Section
      title="Auctions Force-Closed"
      count={data.auctionForceCloseds.length}
    >
      {JSON.stringify(data.auctionForceCloseds, null, 2)}
    </Section>
  );
}
