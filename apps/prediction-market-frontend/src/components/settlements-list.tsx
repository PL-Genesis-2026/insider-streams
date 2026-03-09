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
import { EtherscanLink } from "@/components/etherscan-link";
import { ZERO_TX_HASH } from "@/lib/market-utils";
import { formatConfidenceBps } from "@/lib/format";
import { formatAddress } from "@/lib/wallet/format-address";
import { Bot, CheckCircle2, AlertCircle } from "lucide-react";

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

const ITEMS_LIMIT = 20;

interface GeminiResponseShape {
  answer?: unknown;
  confidence?: unknown;
  sources?: unknown;
}

function parseGeminiResponse(raw: string): GeminiResponseShape | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as GeminiResponseShape;
    }
    return null;
  } catch {
    return null;
  }
}

function getAnswer(gemini: GeminiResponseShape): string | null {
  return typeof gemini.answer === "string" ? gemini.answer : null;
}

function getConfidenceBps(gemini: GeminiResponseShape): number | null {
  return typeof gemini.confidence === "number" ? gemini.confidence : null;
}

export function SettlementsList() {
  const [docs, setDocs] = useState<SettlementDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

    void fetchDocs();
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
            className="h-32 animate-pulse rounded-[calc(var(--radius)+4px)] border bg-card"
          />
        ))}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="rounded-[calc(var(--radius)+4px)] border bg-card p-8 text-center text-sm text-muted-foreground">
        No settlement records found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {docs.map((doc) => {
        const gemini = parseGeminiResponse(doc.geminiResponse);
        const isExpanded = expandedId === doc.id;
        const isSuccess = doc.statusCode === 1 || doc.statusCode === 200;
        const answer = gemini ? getAnswer(gemini) : null;
        const confidenceBps = gemini ? getConfidenceBps(gemini) : null;
        const hasRealTx = doc.txHash !== ZERO_TX_HASH;

        return (
          <div
            key={doc.id}
            className="rounded-[calc(var(--radius)+4px)] border bg-card transition-colors"
          >
            <div className="p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold leading-snug text-card-foreground">
                  {doc.question}
                </h3>
                <Badge
                  variant="outline"
                  className={
                    isSuccess
                      ? "border-emerald-500/30 bg-emerald-500/10 text-[0.6rem] text-emerald-400"
                      : "border-yellow-500/30 bg-yellow-500/10 text-[0.6rem] text-yellow-400"
                  }
                >
                  {isSuccess ? (
                    <CheckCircle2 className="size-2.5" />
                  ) : (
                    <AlertCircle className="size-2.5" />
                  )}
                  Status {doc.statusCode}
                </Badge>
              </div>

              {answer && (
                <div className="mb-3 flex gap-2 rounded-lg border bg-muted/20 p-3">
                  <Bot className="mt-0.5 size-4 shrink-0 text-accent" />
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {answer}
                  </p>
                </div>
              )}

              {confidenceBps !== null && (
                <div className="mb-3 text-xs text-muted-foreground">
                  AI Confidence:{" "}
                  <span className="font-medium text-foreground">
                    {formatConfidenceBps(confidenceBps)}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                <span>Response: {doc.responseId}</span>
                {hasRealTx ? (
                  <EtherscanLink type="tx" value={doc.txHash} className="text-xs text-accent underline-offset-4 hover:underline inline-flex items-center gap-1 font-mono" />
                ) : (
                  <span className="font-mono">
                    Tx: {formatAddress(doc.txHash, 10, 6)} (simulated)
                  </span>
                )}
                <span>{new Date(doc.createdAt).toLocaleString()}</span>
              </div>
            </div>

            <div className="border-t border-border/50 px-5 py-2">
              <button
                type="button"
                onClick={() =>
                  setExpandedId(isExpanded ? null : doc.id)
                }
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {isExpanded ? "Hide raw response" : "Show raw response"}
              </button>
            </div>

            {isExpanded && (
              <div className="border-t border-border/50 px-5 py-4">
                <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  {gemini
                    ? JSON.stringify(gemini, null, 2)
                    : doc.geminiResponse}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
