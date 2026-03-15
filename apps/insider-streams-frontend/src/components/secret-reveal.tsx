"use client";

import { useCallback, useState } from "react";
import {
  Download,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Loader2,
  Lock,
  Unlock,
} from "lucide-react";
import { useAccount } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PrivateSecretState } from "@/lib/private-data/types";
import { usePrivateData } from "@/lib/private-data/use-private-data";
import { cn } from "@/lib/utils";
import { openAppKitConnectModal } from "@/lib/wallet/config";

type SecretRevealCardProps = {
  auctionId: string;
};

type DecryptState =
  | { status: "idle" }
  | { status: "decrypting" }
  | { status: "done"; text: string | null; objectUrl: string | null; contentType: string }
  | { status: "error"; message: string };

function BlurredSkeleton() {
  return (
    <div className="select-none" aria-hidden>
      <div className="space-y-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/40">
          Secret data
        </span>
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-muted-foreground/8" />
          <div className="h-4 w-3/4 rounded bg-muted-foreground/8" />
        </div>
      </div>
      <div className="my-5 border-t border-border/40" />
      <div className="h-10 w-full rounded-md border border-border/40 bg-muted-foreground/5" />
    </div>
  );
}

function isTextContentType(ct: string | null): boolean {
  if (!ct) return false;
  return (
    ct.startsWith("text/") ||
    ct === "application/json" ||
    ct === "application/xml"
  );
}

function DecryptedContent({
  decryptState,
  fileName,
}: {
  decryptState: Extract<DecryptState, { status: "done" }>;
  fileName: string;
}) {
  if (decryptState.text !== null) {
    return (
      <div className="mt-3 rounded-lg border border-border/50 bg-muted/20 p-4">
        <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
          Decrypted content
        </p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm text-foreground">
          {decryptState.text}
        </pre>
      </div>
    );
  }

  if (decryptState.objectUrl && decryptState.contentType.startsWith("image/")) {
    return (
      <div className="mt-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={decryptState.objectUrl}
          alt={fileName}
          className="max-h-64 rounded-lg border border-border/50"
        />
      </div>
    );
  }

  if (decryptState.objectUrl) {
    return (
      <div className="mt-3">
        <Button asChild variant="outline" size="sm">
          <a href={decryptState.objectUrl} download={fileName}>
            <Download className="size-3.5" />
            Download decrypted file
          </a>
        </Button>
      </div>
    );
  }

  return null;
}

function RevealedContent({
  data,
}: {
  data: Extract<PrivateSecretState, { kind: "accessible" }>;
}) {
  const outcome = data.event_data?.outcome;
  const [decryptState, setDecryptState] = useState<DecryptState>({ status: "idle" });

  const handleDecrypt = useCallback(async () => {
    if (!data.file?.retrievalUrl || !data.file?.encryptionKey) return;
    setDecryptState({ status: "decrypting" });
    try {
      const { fetchAndDecrypt } = await import("@/lib/filecoin/decrypt");
      const { data: decryptedBuffer } = await fetchAndDecrypt(
        data.file.retrievalUrl,
        data.file.encryptionKey,
      );

      const ct = data.file.contentType ?? "application/octet-stream";
      if (isTextContentType(ct)) {
        const text = new TextDecoder().decode(decryptedBuffer);
        setDecryptState({ status: "done", text, objectUrl: null, contentType: ct });
      } else {
        const blob = new Blob([decryptedBuffer], { type: ct });
        const objectUrl = URL.createObjectURL(blob);
        setDecryptState({ status: "done", text: null, objectUrl, contentType: ct });
      }
    } catch (err) {
      console.error("[secret-reveal] Decrypt failed:", err);
      setDecryptState({
        status: "error",
        message: err instanceof Error ? err.message : "Decryption failed",
      });
    }
  }, [data.file]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
          Secret data
        </span>
        {outcome ? (
          <Badge
            variant="outline"
            className={cn(
              "border-current/20 bg-background/70",
              outcome === "yes" ? "text-emerald-400" : "text-rose-400",
            )}
          >
            Bet {outcome.toUpperCase()}
          </Badge>
        ) : null}
      </div>
      {data.secret_data.trim().length > 0 ? (
        <p className="text-sm leading-7 text-foreground">{data.secret_data}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          This auction uses a file attachment as the primary secret payload.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {outcome
          ? `Use this signal to bet ${outcome.toUpperCase()} on the linked prediction market.`
          : "This secret was revealed, but the market side was not attached to the record."}
      </p>
      {data.file ? (
        <div className="rounded-xl border border-border/60 bg-background/70 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
              File attachment
            </span>
            <Badge variant="outline" className="gap-1.5">
              <FileText className="size-3" />
              {data.file.fileName}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <KeyRound className="size-3.5" />
                Decryption key
              </span>
              <code className="break-all rounded bg-muted px-2 py-1 text-xs text-foreground">
                {data.file.encryptionKey}
              </code>
            </div>

            <div className="grid gap-2 text-xs text-muted-foreground">
              {data.file.encryptionAlgorithm ? (
                <p>Encryption: {data.file.encryptionAlgorithm}</p>
              ) : null}
              {data.file.pieceCid ? <p>Piece CID: {data.file.pieceCid}</p> : null}
              {data.file.fileMd5 ? <p>MD5: {data.file.fileMd5}</p> : null}
              {data.file.fileSizeBytes ? (
                <p>Original size: {Number(data.file.fileSizeBytes).toLocaleString()} bytes</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="w-fit">
                <a
                  href={data.file.retrievalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="size-3.5" />
                  Download encrypted file
                </a>
              </Button>

              {decryptState.status === "decrypting" ? (
                <Button variant="outline" size="sm" disabled className="w-fit">
                  <Loader2 className="size-3.5 animate-spin" />
                  Decrypting...
                </Button>
              ) : decryptState.status !== "done" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => void handleDecrypt()}
                >
                  <Unlock className="size-3.5" />
                  {decryptState.status === "error" ? "Retry decrypt" : "Decrypt & View"}
                </Button>
              ) : null}
            </div>

            {decryptState.status === "error" ? (
              <p className="text-xs text-destructive">{decryptState.message}</p>
            ) : null}

            {decryptState.status === "done" ? (
              <DecryptedContent
                decryptState={decryptState}
                fileName={data.file.fileName}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SecretRevealCard({ auctionId }: SecretRevealCardProps) {
  const [hidden, setHidden] = useState(false);
  const { isConnected } = useAccount();
  const {
    getSecretState,
    revealForAuctions,
    isLoading,
    error,
    isRevealed: isSessionRevealed,
  } = usePrivateData();

  const secretState = getSecretState(auctionId);

  const handleConnect = useCallback(() => {
    void openAppKitConnectModal();
  }, []);

  const handleReveal = useCallback(() => {
    setHidden(false);
    void revealForAuctions([auctionId]);
  }, [auctionId, revealForAuctions]);

  const handleHide = useCallback(() => {
    setHidden(true);
  }, []);

  if (secretState?.kind === "accessible" && !hidden) {
    return (
      <div>
        <RevealedContent data={secretState} />
        <div className="mt-5 flex justify-center">
          <Button variant="ghost" size="sm" onClick={handleHide}>
            <EyeOff className="size-3.5" />
            Hide secret
          </Button>
        </div>
      </div>
    );
  }

  if (!isLoading && secretState?.kind === "forbidden") {
    return (
      <p className="text-sm leading-7 text-muted-foreground">
        This secret exists, but only the seller and the winning bidder can view
        it.
      </p>
    );
  }

  if (!isLoading && secretState?.kind === "not_found") {
    return (
      <p className="text-sm leading-7 text-muted-foreground">
        Secret not available. Only the auction seller and winning bidder can
        access this secret.
      </p>
    );
  }

  if (isSessionRevealed && error && !secretState && !isLoading) {
    return <p className="text-sm leading-7 text-destructive">{error}</p>;
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "blur-[6px] transition-[filter] duration-300",
          isLoading && "blur-[3px]",
        )}
      >
        <BlurredSkeleton />
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        {error && <p className="text-xs text-destructive">{error}</p>}

        {!isConnected ? (
          <Button variant="outline" size="sm" onClick={handleConnect}>
            <Lock className="size-3.5" />
            Connect wallet to reveal
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReveal}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Eye className="size-3.5" />
            )}
            {isLoading ? "Revealing..." : "Reveal secret"}
          </Button>
        )}
      </div>
    </div>
  );
}
