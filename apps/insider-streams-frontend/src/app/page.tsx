export const dynamic = "force-dynamic";

import { Suspense } from "react";
import {
  AuctionsData,
  BidsData,
  ClosedAuctionsData,
  ForceClosedAuctionsData,
} from "./subgraph-data";

function Loading() {
  return (
    <div className="rounded border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
      Loading...
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-mono dark:bg-black">
      <h1 className="mb-6 text-xl font-bold text-zinc-900 dark:text-zinc-100">
        Insider Streams — Subgraph Data
      </h1>
      <div className="flex flex-col gap-6">
        <Suspense fallback={<Loading />}>
          <AuctionsData />
        </Suspense>
        <Suspense fallback={<Loading />}>
          <BidsData />
        </Suspense>
        <Suspense fallback={<Loading />}>
          <ClosedAuctionsData />
        </Suspense>
        <Suspense fallback={<Loading />}>
          <ForceClosedAuctionsData />
        </Suspense>
      </div>
    </div>
  );
}
