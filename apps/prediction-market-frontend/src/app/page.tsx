"use client";

import { useState } from "react";
import { EventsList } from "@/components/events-list";
import { SettlementsList } from "@/components/settlements-list";

type Tab = "events" | "settlements";

export default function Home() {
  const [tab, setTab] = useState<Tab>("events");

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <h1 className="mb-8 text-3xl font-bold text-white">Prediction Market</h1>

      {/* Tab bar */}
      <div className="mb-6 flex border-b border-gray-700">
        <button
          type="button"
          onClick={() => setTab("events")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === "events"
              ? "border-b-2 border-blue-500 text-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Events
        </button>
        <button
          type="button"
          onClick={() => setTab("settlements")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === "settlements"
              ? "border-b-2 border-blue-500 text-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Settlements
        </button>
      </div>

      {/* Tab content */}
      {tab === "events" && <EventsList />}
      {tab === "settlements" && <SettlementsList />}
    </main>
  );
}
