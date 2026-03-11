"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSignedWalletSession } from "@/lib/wallet/use-signed-wallet-session";
import { useWalletSession } from "@/lib/wallet/use-wallet-session";

type AdminExpireAuctionButtonProps = {
  auctionId: string;
  ownerAddress: string | null;
};

export function AdminExpireAuctionButton({
  auctionId,
  ownerAddress,
}: AdminExpireAuctionButtonProps) {
  const router = useRouter();
  const walletSession = useWalletSession();
  const { getSignedSession } = useSignedWalletSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isOwner = useMemo(() => {
    if (!ownerAddress || !walletSession.address) return false;
    return walletSession.address.toLowerCase() === ownerAddress;
  }, [ownerAddress, walletSession.address]);

  const handleExpire = useCallback(async () => {
    if (!walletSession.isConnected) {
      toast.error("Connect the admin wallet before expiring an auction.");
      return;
    }

    if (!walletSession.isSupportedChain) {
      toast.error(`Switch to ${walletSession.requiredChainName} first.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const { signature, timestamp } = await getSignedSession();
      const response = await fetch("/api/auction/admin-expire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auctionId, signature, timestamp }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        txHash?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to expire auction");
      }

      toast.success("Auction marked expired. Refreshing detail view.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to expire auction",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    auctionId,
    getSignedSession,
    router,
    walletSession.isConnected,
    walletSession.isSupportedChain,
    walletSession.requiredChainName,
  ]);

  if (!isOwner) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-amber-500/15 p-2 text-amber-300">
          <AlertTriangle className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Admin controls</p>
            <p className="text-sm text-muted-foreground">
              Expire this auction immediately so the closer flow can settle it
              on the next pass.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleExpire()}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {isSubmitting ? "Expiring auction..." : "Expire auction now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
