"use client";

import { SettlementsList } from "@/components/settlements-list";

export default function SettlementsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <div className="mb-8">
        <h1 className="font-serif text-[2.4rem] font-medium leading-[0.94] tracking-[-0.04em] text-foreground md:text-[3rem]">
          Settlements
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          On-chain settlement audit trail. Each outcome is verified by
          Chainlink CRE using Gemini AI with Google Search grounding.
        </p>
      </div>

      <SettlementsList />
    </main>
  );
}
