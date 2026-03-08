"use client";

import { useState, useCallback } from "react";
import { useWriteContract } from "wagmi";
import {
  examplePredictionMarketAbi,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  CONFIDENTIAL_USDC_DECIMALS,
} from "@private-streams/common";
import { parseUnits, type Address } from "viem";
import { Loader2, ExternalLink, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";

type RedeemSharesPanelProps = {
  eventId: string;
  outcome: number;
};

type RedeemState =
  | { step: "idle" }
  | { step: "redeeming" }
  | { step: "success"; txHash: string }
  | { step: "error"; message: string };

function outcomeLabel(outcome: number): string {
  switch (outcome) {
    case 1:
      return "No";
    case 2:
      return "Yes";
    default:
      return "Unknown";
  }
}

export function RedeemSharesPanel({
  eventId,
  outcome,
}: RedeemSharesPanelProps) {
  const walletSession = useWalletSession();
  const [amount, setAmount] = useState("");
  const [redeemState, setRedeemState] = useState<RedeemState>({
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

  const canRedeem =
    walletSession.isSupportedChain &&
    walletSession.isConnected &&
    parsedAmount !== null &&
    redeemState.step === "idle";

  const handleRedeem = useCallback(async () => {
    if (!canRedeem || !parsedAmount) return;

    try {
      setRedeemState({ step: "redeeming" });

      const txHash = await writeContractAsync({
        address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
        abi: examplePredictionMarketAbi,
        functionName: "redeemShares",
        args: [BigInt(eventId), parsedAmount],
      });

      setRedeemState({ step: "success", txHash });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Redemption failed";
      setRedeemState({ step: "error", message });
    }
  }, [canRedeem, parsedAmount, writeContractAsync, eventId]);

  if (!walletSession.isConnected) {
    return (
      <div className="rounded-[calc(var(--radius)+6px)] border border-emerald-500/20 bg-emerald-500/5 p-5">
        <h2 className="mb-3 font-serif text-xl font-medium tracking-[-0.03em] text-emerald-300">
          Redeem winnings
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Connect your wallet to redeem winning shares.
        </p>
        <ConnectWalletButton variant="accent" />
      </div>
    );
  }

  if (redeemState.step === "success") {
    return (
      <div className="rounded-[calc(var(--radius)+6px)] border border-emerald-500/25 bg-emerald-500/5 p-5">
        <h2 className="mb-2 font-serif text-xl font-medium tracking-[-0.03em] text-emerald-300">
          Shares redeemed
        </h2>
        <p className="text-sm text-muted-foreground">
          Your winning shares have been burned and USDC returned to your wallet.
        </p>
        <a
          href={`https://sepolia.etherscan.io/tx/${redeemState.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent underline underline-offset-4 hover:text-accent/80"
        >
          View on Etherscan
          <ExternalLink className="size-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-[calc(var(--radius)+6px)] border border-emerald-500/20 bg-emerald-500/5 p-5">
      <h2 className="mb-1 font-serif text-xl font-medium tracking-[-0.03em] text-emerald-300">
        <Coins className="mb-0.5 mr-2 inline size-5" />
        Redeem winnings
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        This event settled{" "}
        <span className="font-semibold text-foreground">
          {outcomeLabel(outcome)}
        </span>
        . Burn your winning {outcomeLabel(outcome)} shares to receive USDC.
      </p>

      <div className="space-y-3">
        <div>
          <label
            htmlFor="redeem-amount"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Shares to redeem
          </label>
          <Input
            id="redeem-amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            disabled={redeemState.step === "redeeming"}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (redeemState.step === "error") {
                setRedeemState({ step: "idle" });
              }
            }}
          />
        </div>

        {redeemState.step === "error" && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {redeemState.message}
          </div>
        )}

        <Button
          type="button"
          className="w-full"
          variant="accent"
          disabled={!canRedeem}
          onClick={() => void handleRedeem()}
        >
          {redeemState.step === "redeeming" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Redeeming...
            </>
          ) : (
            "Redeem shares"
          )}
        </Button>
      </div>
    </div>
  );
}
