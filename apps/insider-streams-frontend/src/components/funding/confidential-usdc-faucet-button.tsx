"use client";

import { useState } from "react";
import stringify from "fast-json-stable-stringify";
import { Droplets, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSignMessage } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  CONFIDENTIAL_USDC_FAUCET_ACTION,
  CONFIDENTIAL_USDC_FAUCET_AMOUNT_DISPLAY,
  type ConfidentialUsdcFaucetResponse,
} from "@/lib/faucet/shared";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";

type FaucetPhase = "idle" | "signing" | "submitting";

type ConfidentialUsdcFaucetButtonProps = {
  onSuccess?: () => void;
};

export function ConfidentialUsdcFaucetButton({ onSuccess }: ConfidentialUsdcFaucetButtonProps) {
  const walletSession = useWalletSession();
  const { signMessageAsync } = useSignMessage();
  const [phase, setPhase] = useState<FaucetPhase>("idle");

  const isPending = phase === "signing" || phase === "submitting";

  async function handleMint() {
    if (!walletSession.isConnected || !walletSession.address) {
      toast.error("Connect a Sepolia wallet before using the faucet.");
      return;
    }

    if (!walletSession.isSupportedChain) {
      toast.error(`Switch to ${walletSession.requiredChainName} to use the faucet.`);
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const payload = {
      action: CONFIDENTIAL_USDC_FAUCET_ACTION,
      address: walletSession.address,
      timestamp,
    };

    try {
      setPhase("signing");
      const signature = await signMessageAsync({
        message: stringify(payload),
      });

      setPhase("submitting");
      const response = await fetch("/api/faucet/confidential-usdc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          signature,
        }),
      });

      const result = (await response.json()) as ConfidentialUsdcFaucetResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.success ? "Faucet mint failed." : result.error,
        );
      }

      toast.success(
        `Minted ${CONFIDENTIAL_USDC_FAUCET_AMOUNT_DISPLAY} test USDC to your wallet.`,
      );
      onSuccess?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Faucet mint failed.",
      );
    } finally {
      setPhase("idle");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => {
        void handleMint();
      }}
    >
      {isPending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Minting...
        </>
      ) : (
        <>
          <Droplets className="size-4" />
          Get {CONFIDENTIAL_USDC_FAUCET_AMOUNT_DISPLAY} test USDC
        </>
      )}
    </Button>
  );
}
