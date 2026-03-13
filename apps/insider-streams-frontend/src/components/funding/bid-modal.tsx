"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSignMessage } from "wagmi";
import { Gavel, Loader2 } from "lucide-react";
import stringify from "fast-json-stable-stringify";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Phase = "idle" | "signing" | "submitting" | "success" | "error";

type BidModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auctionId: string;
  currentBidUsdc?: number;
  availableBalance: string | null;
  onBidSuccess?: (amountUsdc?: string) => void;
};

function formatUsd(usdc: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(usdc);
}

export function BidModal({
  open,
  onOpenChange,
  auctionId,
  currentBidUsdc,
  availableBalance,
  onBidSuccess,
}: BidModalProps) {
  const router = useRouter();
  const { signMessageAsync } = useSignMessage();

  const [amountUsdc, setAmountUsdc] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const minBid = currentBidUsdc !== undefined ? currentBidUsdc + 1 : 1;
  const availableBalanceRaw = availableBalance ? BigInt(availableBalance) : null;

  function validate(): string | null {
    const parsed = Number(amountUsdc);
    if (!amountUsdc || isNaN(parsed) || parsed <= 0) {
      return "Enter a valid bid amount.";
    }
    const rawAmount = BigInt(Math.round(parsed * 1_000_000));
    const minRaw = BigInt(Math.round(minBid * 1_000_000));
    if (rawAmount < minRaw) {
      return `Bid must be at least ${formatUsd(minBid)}.`;
    }
    if (availableBalanceRaw !== null && rawAmount > availableBalanceRaw) {
      const maxUsdc = Number(availableBalanceRaw) / 1_000_000;
      return `Bid exceeds available balance of ${formatUsd(maxUsdc)}.`;
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const parsed = Number(amountUsdc);
    const rawAmount = BigInt(Math.round(parsed * 1_000_000));
    const timestamp = Math.floor(Date.now() / 1000);

    const payload = { auctionId, amount: rawAmount.toString(), timestamp };

    try {
      setPhase("signing");
      setErrorMessage(null);
      const signature = await signMessageAsync({ message: stringify(payload) });

      setPhase("submitting");
      const res = await fetch("/api/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, signature }),
      });

      const data = (await res.json()) as { error?: string; code?: string };

      if (!res.ok) {
        setPhase("error");
        setErrorMessage(data.error ?? `Request failed (${res.status})`);
        return;
      }

      setPhase("success");
      onBidSuccess?.(amountUsdc);
      setTimeout(() => {
        onOpenChange(false);
        // Delay page refresh to give subgraph time to index the new bid
        setTimeout(() => router.refresh(), 3000);
      }, 1500);
    } catch (err) {
      setPhase("error");
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
    }
  }

  function handleOpenChange(next: boolean) {
    if (phase === "signing" || phase === "submitting") return;
    if (!next) {
      setAmountUsdc("");
      setPhase("idle");
      setErrorMessage(null);
    }
    onOpenChange(next);
  }

  const isLoading = phase === "signing" || phase === "submitting";

  const availableBalanceUsdc =
    availableBalanceRaw !== null ? Number(availableBalanceRaw) / 1_000_000 : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="size-4 text-accent" />
            Place a bid
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {phase !== "success" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="bid-amount">Bid amount (USDC)</Label>
                <Input
                  id="bid-amount"
                  type="number"
                  min={minBid}
                  step="1"
                  placeholder={`Min. ${formatUsd(minBid)}`}
                  value={amountUsdc}
                  onChange={(e) => {
                    setAmountUsdc(e.target.value);
                    setErrorMessage(null);
                  }}
                  disabled={isLoading}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                  {currentBidUsdc !== undefined ? (
                    <span>Current bid: {formatUsd(currentBidUsdc)}</span>
                  ) : (
                    <span>No bids yet</span>
                  )}
                  {availableBalanceUsdc !== null && (
                    <span>Available: {formatUsd(availableBalanceUsdc)}</span>
                  )}
                </div>
              </div>

              {errorMessage ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMessage}
                </p>
              ) : null}

              {phase === "signing" ? (
                <p className="text-sm text-muted-foreground">
                  Check your wallet to sign the bid request…
                </p>
              ) : null}

              {phase === "submitting" ? (
                <p className="text-sm text-muted-foreground">
                  Submitting bid on-chain…
                </p>
              ) : null}
            </>
          ) : (
            <div className="rounded-lg border border-accent/30 bg-accent/8 px-4 py-3 text-sm text-accent">
              Bid placed successfully. Updating auction…
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isLoading || phase === "success"}>
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {phase === "signing" ? "Signing…" : "Placing bid…"}
              </>
            ) : (
              <>
                Place Bid
                <Gavel className="size-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
