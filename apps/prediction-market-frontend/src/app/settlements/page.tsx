"use client";

import { SettlementsList } from "@/components/settlements-list";

export default function SettlementsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 md:px-10">
      <div className="mb-10">
        <h1 className="font-serif text-[2.8rem] font-medium leading-[0.94] tracking-[-0.04em] text-foreground">
          Settlements
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          CRE settlement audit trail powered by Gemini AI with Google Search
          grounding.
        </p>
      </div>

      <SettlementsList />
    </main>
  );
}
