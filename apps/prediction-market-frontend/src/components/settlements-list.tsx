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
import { Badge } from "@/components/ui/badge";

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
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
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
            className="h-40 animate-pulse rounded-[calc(var(--radius)+6px)] border bg-card"
          />
        ))}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="rounded-[calc(var(--radius)+6px)] border bg-card p-6 text-center text-sm text-muted-foreground">
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
            className="rounded-[calc(var(--radius)+6px)] border bg-card p-5"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-card-foreground">
                {doc.question}
              </h3>
              <Badge
                variant={doc.statusCode === 1 ? "accent" : "muted"}
                className="text-[0.65rem]"
              >
                Status: {doc.statusCode}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>Response: {doc.responseId}</span>
              <span>Tx: {shortenHash(doc.txHash)}</span>
              <span>{new Date(doc.createdAt).toLocaleString()}</span>
            </div>

            {geminiParsed && (
              <pre className="mt-3 overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                {geminiParsed}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
