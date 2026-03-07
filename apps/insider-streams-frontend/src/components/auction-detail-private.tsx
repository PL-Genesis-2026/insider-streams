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
  const { registerVisibleAuctions } = usePrivateData();

  useEffect(() => {
    registerVisibleAuctions("auction-detail", [auctionId]);
  }, [auctionId, registerVisibleAuctions]);

  return <>{children}</>;
}
