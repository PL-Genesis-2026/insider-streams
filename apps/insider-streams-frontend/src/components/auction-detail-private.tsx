"use client";

import { useEffect, type ReactNode } from "react";
import { usePrivateData } from "@/lib/private-data/use-private-data";

type AuctionDetailPrivateProps = {
  auctionId: string;
  children: ReactNode;
};

export function AuctionDetailPrivate({
  auctionId,
  children,
}: AuctionDetailPrivateProps) {
  const { registerVisibleAuctions, unregisterVisibleAuctions } = usePrivateData();

  useEffect(() => {
    registerVisibleAuctions("auction-detail", [auctionId]);
    return () => unregisterVisibleAuctions("auction-detail");
  }, [auctionId, registerVisibleAuctions, unregisterVisibleAuctions]);

  return <>{children}</>;
}
