"use client";

import { EventsList } from "@/components/events-list";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <div className="mb-8">
        <h1 className="font-serif text-[2.4rem] font-medium leading-[0.94] tracking-[-0.04em] text-foreground md:text-[3rem]">
          Prediction Market
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Trade on real-world outcomes with Yes/No shares. Markets are settled
          on-chain by Chainlink CRE with Gemini AI verification.
        </p>
      </div>

      <EventsList />
    </main>
  );
}
