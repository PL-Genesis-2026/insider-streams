"use client";

import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Eye, Loader2 } from "lucide-react";
import { usePrivateData } from "@/lib/private-data/use-private-data";

export function RevealPrivateDataButton() {
  const { isConnected } = useAccount();
  const {
    isRevealed,
    isLoading,
    error,
    revealForAuctions,
    getVisibleAuctionIds,
  } = usePrivateData();

  if (!isConnected) return null;

  const handleClick = () => {
    void revealForAuctions(getVisibleAuctionIds());
  };

  if (isRevealed) return null;

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="animate-spin" />
        Revealing...
      </Button>
    );
  }

  if (error) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="text-destructive"
        onClick={handleClick}
      >
        <Eye />
        Retry
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      <Eye />
      Reveal secret data
    </Button>
  );
}
