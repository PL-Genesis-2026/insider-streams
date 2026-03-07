"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

interface SettlementDoc {
  id: string;
  statusCode: number;
  question: string;
  geminiResponse: string;
  responseId: string;
  rawJsonString: string;
  txHash: string;
  createdAt: number;
}

const ITEMS_LIMIT = 10;

function shortenHash(hash: string): string {
  if (
    hash ===
    "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    return "0x00000... (simulated)";
  }
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export function SettlementsList() {
  const [docs, setDocs] = useState<SettlementDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const q = query(
          collection(db, "demo"),
          orderBy("createdAt", "desc"),
          limit(ITEMS_LIMIT),
        );
        const querySnapshot = await getDocs(q);
        const docsData = querySnapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            }) as SettlementDoc,
        );
        setDocs(docsData);
      } catch (err) {
        console.error(err);
        if (err instanceof Error) {
          setError(
            `Failed to fetch data: ${err.message}. Ensure your Firebase configuration and security rules are set up correctly.`,
          );
        } else {
          setError("An unknown error occurred.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDocs();
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-lg border border-gray-700 bg-gray-800"
          />
        ))}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6 text-center text-sm text-gray-400">
        No settlement records found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {docs.map((doc) => {
        let geminiParsed: string | null = null;
        try {
          geminiParsed = JSON.stringify(JSON.parse(doc.geminiResponse), null, 2);
        } catch {
          /* ignore */
        }

        return (
          <div
            key={doc.id}
            className="rounded-lg border border-gray-700 bg-gray-800 p-5"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-white">
                {doc.question}
              </h3>
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  doc.statusCode === 1
                    ? "border-green-500/30 bg-green-500/20 text-green-400"
                    : "border-gray-500/30 bg-gray-500/20 text-gray-400"
                }`}
              >
                Status: {doc.statusCode}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
              <span>Response: {doc.responseId}</span>
              <span>Tx: {shortenHash(doc.txHash)}</span>
              <span>
                {new Date(doc.createdAt).toLocaleString()}
              </span>
            </div>

            {geminiParsed && (
              <pre className="mt-3 overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-300">
                {geminiParsed}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
