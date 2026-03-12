"use client";

import { useState, useCallback } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import {
  examplePredictionMarketAbi,
  EXAMPLE_PREDICTION_MARKET_ADDRESS,
  CONFIDENTIAL_USDC_DECIMALS,
} from "@private-streams/common";
import { parseUnits, type Address } from "viem";
import { Loader2, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EtherscanLink } from "@/components/etherscan-link";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { SwitchNetworkButton } from "@/components/wallet/switch-network-button";
import { outcomeLabel } from "@/lib/format";
import { walletEnabled } from "@/lib/wallet/config";

type RedeemSharesPanelProps = {
  eventId: string;
  outcome: number;
};

type RedeemState =
  | { step: "idle" }
  | { step: "redeeming" }
  | { step: "success"; txHash: string }
  | { step: "error"; message: string };

export function RedeemSharesPanel({
  eventId,
  outcome,
}: RedeemSharesPanelProps) {
  if (!walletEnabled) {
    return (
      <div className="rounded-[calc(var(--radius)+6px)] border border-border/70 bg-card p-5">
        <h2 className="mb-2 font-serif text-xl font-medium tracking-[-0.03em] text-card-foreground">
          Redemption unavailable
        </h2>
        <p className="text-sm text-muted-foreground">
          Wallet redemption is disabled in this deployment until
          `NEXT_PUBLIC_PROJECT_ID` is configured.
        </p>
      </div>
    );
  }

  return <RedeemSharesPanelWithWallet eventId={eventId} outcome={outcome} />;
}

function RedeemSharesPanelWithWallet({
  eventId,
  outcome,
}: RedeemSharesPanelProps) {
  const walletSession = useWalletSession();
  const [amount, setAmount] = useState("");
  const [redeemState, setRedeemState] = useState<RedeemState>({
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

  const canRedeem =
    walletSession.isSupportedChain &&
    walletSession.isConnected &&
    parsedAmount !== null &&
    redeemState.step === "idle";

  const handleRedeem = useCallback(async () => {
    if (!canRedeem || !parsedAmount) return;
    if (!publicClient) {
      setRedeemState({
        step: "error",
        message: "Public client unavailable. Reconnect your wallet and try again.",
      });
      return;
    }
    if (!walletSession.address) {
      setRedeemState({
        step: "error",
        message: "Wallet address unavailable. Reconnect your wallet and try again.",
      });
      return;
    }

    try {
      setRedeemState({ step: "redeeming" });

      const gas = await publicClient.estimateContractGas({
        account: walletSession.address,
        address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
        abi: examplePredictionMarketAbi,
        functionName: "redeemShares",
        args: [BigInt(eventId), parsedAmount],
      });
      const txHash = await writeContractAsync({
        address: EXAMPLE_PREDICTION_MARKET_ADDRESS as Address,
        abi: examplePredictionMarketAbi,
        functionName: "redeemShares",
        args: [BigInt(eventId), parsedAmount],
        gas,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setRedeemState({ step: "success", txHash });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Redemption failed";
      setRedeemState({ step: "error", message });
    }
  }, [
    canRedeem,
    parsedAmount,
    publicClient,
    walletSession.address,
    writeContractAsync,
    eventId,
  ]);

  const needsWallet = !walletSession.isConnected;
  const needsNetwork = walletSession.isConnected && !walletSession.isSupportedChain;

  if (redeemState.step === "success") {
    return (
      <div className="rounded-[calc(var(--radius)+6px)] border border-emerald-500/25 bg-emerald-500/5 p-5">
        <h2 className="mb-2 font-serif text-xl font-medium tracking-[-0.03em] text-emerald-300">
          Shares redeemed
        </h2>
        <p className="text-sm text-muted-foreground">
          Your winning shares have been burned and USDC returned to your wallet.
        </p>
        <div className="mt-2">
          <EtherscanLink
            type="tx"
            value={redeemState.txHash}
            className="inline-flex items-center gap-1.5 text-xs text-accent underline underline-offset-4 hover:text-accent/80 font-mono"
          />
        </div>
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

        {needsWallet ? (
          <ConnectWalletButton className="w-full [&>button]:w-full" variant="accent" />
        ) : needsNetwork ? (
          <SwitchNetworkButton className="w-full [&>button]:w-full" showError />
        ) : (
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
        )}
      </div>
    </div>
  );
}
