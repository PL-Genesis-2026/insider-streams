"use client";

import { useState, useCallback } from "react";
import { useWriteContract } from "wagmi";
import {
  examplePredictionMarketAbi,
  confidentialUsdcAbi,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  CONFIDENTIAL_USDC_ADDRESS,
  CONFIDENTIAL_USDC_DECIMALS,
} from "@private-streams/common";
import { parseUnits, type Address } from "viem";
import { Loader2, TrendingUp, TrendingDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { cn } from "@/lib/utils";
import { env } from "@/env";

type BuySharesPanelProps = {
  eventId: string;
};

type Outcome = "yes" | "no";

type PurchaseState =
  | { step: "idle" }
  | { step: "approving" }
  | { step: "buying" }
  | { step: "confirming" }
  | { step: "success"; txHash: string; outcome: Outcome; amount: string }
  | { step: "error"; message: string };

const OUTCOME_CONTRACT_VALUES = { yes: 2, no: 1 } as const;

export function BuySharesPanel({ eventId }: BuySharesPanelProps) {
  const walletSession = useWalletSession();
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [amount, setAmount] = useState("");
  const [purchaseState, setPurchaseState] = useState<PurchaseState>({
    step: "idle",
  });

  const { writeContractAsync } = useWriteContract();

  const parsedAmount = (() => {
    try {
      const trimmed = amount.trim();
      if (!trimmed || Number(trimmed) <= 0) return null;
      return parseUnits(trimmed, CONFIDENTIAL_USDC_DECIMALS);
    } catch {
      return null;
    }
  })();

  const canBuy =
    walletSession.isSupportedChain &&
    walletSession.isConnected &&
    selectedOutcome !== null &&
    parsedAmount !== null &&
    purchaseState.step === "idle";

  const handleBuy = useCallback(async () => {
    if (!canBuy || !parsedAmount || !selectedOutcome) return;

    const contractAddress =
      EXAMPLE_PREDICTION_MARKET_ADDRESS as Address;
    const usdcAddress = CONFIDENTIAL_USDC_ADDRESS as Address;

    try {
      setPurchaseState({ step: "approving" });

      await writeContractAsync({
        address: usdcAddress,
        abi: confidentialUsdcAbi,
        functionName: "approve",
        args: [contractAddress, parsedAmount],
      });

      setPurchaseState({ step: "buying" });

      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: examplePredictionMarketAbi,
        functionName: "buyShares",
        args: [
          BigInt(eventId),
          OUTCOME_CONTRACT_VALUES[selectedOutcome],
          parsedAmount,
        ],
      });

      setPurchaseState({
        step: "success",
        txHash,
        outcome: selectedOutcome,
        amount: amount.trim(),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Transaction failed";
      setPurchaseState({ step: "error", message });
    }
  }, [
    canBuy,
    parsedAmount,
    selectedOutcome,
    writeContractAsync,
    eventId,
    amount,
  ]);

  const needsWallet = !walletSession.isConnected;
  const needsNetwork = walletSession.isConnected && !walletSession.isSupportedChain;

  if (purchaseState.step === "success") {
    const insiderStreamsUrl = env.NEXT_PUBLIC_INSIDER_STREAMS_URL;
    const createAuctionUrl = `${insiderStreamsUrl}/create?eventId=${eventId}`;

    return (
      <div className="space-y-4">
        <div className="rounded-[calc(var(--radius)+6px)] border border-emerald-500/25 bg-emerald-500/5 p-5">
          <h2 className="mb-2 font-serif text-xl font-medium tracking-[-0.03em] text-emerald-300">
            Shares purchased
          </h2>
          <p className="text-sm text-muted-foreground">
            You bought{" "}
            <span className="font-semibold text-foreground">
              {purchaseState.amount} USDC
            </span>{" "}
            worth of{" "}
            <span
              className={cn(
                "font-semibold",
                purchaseState.outcome === "yes"
                  ? "text-emerald-400"
                  : "text-rose-400",
              )}
            >
              {purchaseState.outcome.toUpperCase()}
            </span>{" "}
            shares.
          </p>
          <a
            href={`https://sepolia.etherscan.io/tx/${purchaseState.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent underline underline-offset-4 hover:text-accent/80"
          >
            View on Etherscan
            <ExternalLink className="size-3" />
          </a>
        </div>

        <div className="rounded-[calc(var(--radius)+6px)] border border-accent/25 bg-accent/5 p-5">
          <h3 className="mb-1 font-serif text-lg font-medium tracking-[-0.03em] text-accent">
            Monetize your conviction
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            You just backed your position with real capital. Now sell your signal
            as an insider stream — auction your thesis to other traders and
            squeeze more value from your edge.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="accent">
              <a href={createAuctionUrl} target="_blank" rel="noopener noreferrer">
                Sell your signal
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPurchaseState({ step: "idle" });
                setSelectedOutcome(null);
                setAmount("");
              }}
            >
              Trade again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isProcessing =
    purchaseState.step === "approving" ||
    purchaseState.step === "buying" ||
    purchaseState.step === "confirming";

  return (
    <div className="rounded-[calc(var(--radius)+6px)] border bg-card p-5">
      <h2 className="mb-4 font-serif text-xl font-medium tracking-[-0.03em] text-card-foreground">
        Trade
      </h2>

      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">
            Pick your side
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setSelectedOutcome("yes")}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors",
                selectedOutcome === "yes"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                  : "border-border/60 bg-background/60 text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-400/80",
              )}
            >
              <TrendingUp className="size-4" />
              YES
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setSelectedOutcome("no")}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors",
                selectedOutcome === "no"
                  ? "border-rose-500 bg-rose-500/10 text-rose-400"
                  : "border-border/60 bg-background/60 text-muted-foreground hover:border-rose-500/40 hover:text-rose-400/80",
              )}
            >
              <TrendingDown className="size-4" />
              NO
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="share-amount"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Amount (USDC)
          </label>
          <Input
            id="share-amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            disabled={isProcessing}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (purchaseState.step === "error") {
                setPurchaseState({ step: "idle" });
              }
            }}
          />
        </div>

        {purchaseState.step === "error" && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {purchaseState.message}
          </div>
        )}

        {needsWallet ? (
          <ConnectWalletButton className="w-full [&>button]:w-full" variant="accent" />
        ) : needsNetwork ? (
          <SwitchNetworkButton className="w-full [&>button]:w-full" showError />
        ) : (
          <Button
            type="button"
            className="w-full"
            variant={selectedOutcome === "yes" ? "yes" : selectedOutcome === "no" ? "no" : "default"}
            disabled={!canBuy}
            onClick={() => void handleBuy()}
          >
            {purchaseState.step === "approving" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Approving USDC...
              </>
            ) : purchaseState.step === "buying" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Buying shares...
              </>
            ) : purchaseState.step === "confirming" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Confirming...
              </>
            ) : selectedOutcome ? (
              `Buy ${selectedOutcome.toUpperCase()} shares`
            ) : (
              "Select an outcome"
            )}
          </Button>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Requires ConfidentialUSDC on Sepolia. 1 USDC = 1 share at par.
        </p>
      </div>
    </div>
  );
}
