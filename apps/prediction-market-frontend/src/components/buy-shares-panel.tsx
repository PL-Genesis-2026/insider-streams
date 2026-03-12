"use client";

import { useState, useCallback } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import {
  examplePredictionMarketAbi,
  confidentialUsdcAbi,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  CONFIDENTIAL_USDC_DECIMALS,
} from "@private-streams/common";
import { maxUint256, parseUnits, type Address } from "viem";
import { ArrowRight, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EtherscanLink } from "@/components/etherscan-link";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { OUTCOME } from "@/lib/market-utils";
import { cn } from "@/lib/utils";
import { env } from "@/env";
import { walletEnabled } from "@/lib/wallet/config";

type BuySharesPanelProps = {
  eventId: string;
};

type Outcome = "yes" | "no";

type PurchaseState =
  | { step: "idle" }
  | { step: "approving" }
  | { step: "buying" }
  | { step: "success"; txHash: string; outcome: Outcome; amount: string }
  | { step: "error"; message: string };

const OUTCOME_CONTRACT_VALUES = { yes: OUTCOME.Yes, no: OUTCOME.No } as const;

export function BuySharesPanel({ eventId }: BuySharesPanelProps) {
  if (!walletEnabled) {
    return (
      <div className="rounded-[calc(var(--radius)+6px)] border border-border/70 bg-card p-5">
        <h2 className="mb-2 font-serif text-xl font-medium tracking-[-0.03em] text-card-foreground">
          Trading unavailable
        </h2>
        <p className="text-sm text-muted-foreground">
          Wallet trading is disabled in this deployment until
          `NEXT_PUBLIC_PROJECT_ID` is configured.
        </p>
      </div>
    );
  }

  return <BuySharesPanelWithWallet eventId={eventId} />;
}

function BuySharesPanelWithWallet({ eventId }: BuySharesPanelProps) {
  const walletSession = useWalletSession();
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [amount, setAmount] = useState("");
  const [purchaseState, setPurchaseState] = useState<PurchaseState>({
    step: "idle",
  });

  const publicClient = usePublicClient();
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
    if (!publicClient) {
      setPurchaseState({
        step: "error",
        message: "Public client unavailable. Reconnect your wallet and try again.",
      });
      return;
    }
    if (!walletSession.address) {
      setPurchaseState({
        step: "error",
        message: "Wallet address unavailable. Reconnect your wallet and try again.",
      });
      return;
    }

    const contractAddress =
      EXAMPLE_PREDICTION_MARKET_ADDRESS as Address;
    const account = walletSession.address;

    try {
      setPurchaseState({ step: "approving" });

      const usdcAddress = await publicClient.readContract({
        address: contractAddress,
        abi: examplePredictionMarketAbi,
        functionName: "paymentToken",
      });

      const currentAllowance = await publicClient.readContract({
        address: usdcAddress,
        abi: confidentialUsdcAbi,
        functionName: "allowance",
        args: [account, contractAddress],
      });

      if (currentAllowance < parsedAmount) {
        const approveGas = await publicClient.estimateContractGas({
          account,
          address: usdcAddress,
          abi: confidentialUsdcAbi,
          functionName: "approve",
          args: [contractAddress, maxUint256],
        });
        const approveHash = await writeContractAsync({
          address: usdcAddress,
          abi: confidentialUsdcAbi,
          functionName: "approve",
          args: [contractAddress, maxUint256],
          gas: approveGas,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setPurchaseState({ step: "buying" });

      const buyGas = await publicClient.estimateContractGas({
        account,
        address: contractAddress,
        abi: examplePredictionMarketAbi,
        functionName: "buyShares",
        args: [
          BigInt(eventId),
          OUTCOME_CONTRACT_VALUES[selectedOutcome],
          parsedAmount,
        ],
      });
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: examplePredictionMarketAbi,
        functionName: "buyShares",
        args: [
          BigInt(eventId),
          OUTCOME_CONTRACT_VALUES[selectedOutcome],
          parsedAmount,
        ],
        gas: buyGas,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });

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
    publicClient,
    selectedOutcome,
    walletSession.address,
    writeContractAsync,
    eventId,
    amount,
  ]);

  const needsWallet = !walletSession.isConnected;
  const needsNetwork = walletSession.isConnected && !walletSession.isSupportedChain;

  if (purchaseState.step === "success") {
    const insiderStreamsUrl = env.NEXT_PUBLIC_INSIDER_STREAMS_URL;
    const createAuctionUrl = insiderStreamsUrl
      ? `${insiderStreamsUrl}/create?${new URLSearchParams({
          eventId,
          privateLeg: purchaseState.outcome,
        }).toString()}`
      : null;

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
          <div className="mt-2">
            <EtherscanLink
              type="tx"
              value={purchaseState.txHash}
              className="inline-flex items-center gap-1.5 text-xs text-accent underline underline-offset-4 hover:text-accent/80 font-mono"
            />
          </div>
        </div>

        <div className="rounded-[calc(var(--radius)+6px)] border border-accent/25 bg-accent/5 p-5">
          <h3 className="mb-3 font-serif text-xl font-medium tracking-[-0.04em] text-accent">
            Sell your signal
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Turn your <span className="font-medium text-foreground">{purchaseState.outcome.toUpperCase()}</span> position into a private auction.
          </p>
          {createAuctionUrl ? (
            <Button
              asChild
              variant="accent"
              className="mb-3 h-11 w-full"
            >
              <a href={createAuctionUrl} target="_blank" rel="noopener noreferrer">
                Create auction
                <ArrowRight className="ml-2 size-4" />
              </a>
            </Button>
          ) : (
            <div className="mb-3 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
              Auction handoff is unavailable in this deployment because
              `NEXT_PUBLIC_INSIDER_STREAMS_URL` is not configured.
            </div>
          )}
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            onClick={() => {
              setPurchaseState({ step: "idle" });
              setSelectedOutcome(null);
              setAmount("");
            }}
          >
            Trade again
          </button>
        </div>
      </div>
    );
  }

  const isProcessing =
    purchaseState.step === "approving" ||
    purchaseState.step === "buying";

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
            ) : selectedOutcome ? (
              `Buy ${selectedOutcome.toUpperCase()} shares`
            ) : (
              "Select an outcome"
            )}
          </Button>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Requires ConfidentialUSDC on Sepolia. Winning shares redeem 1:1 for
          USDC after settlement.
        </p>
      </div>
    </div>
  );
}
