export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AuctionCard } from "@/components/auction-card";
import { getSellerDetail } from "@/lib/seller-detail";

type SellerPageProps = {
  params: Promise<{
    sellerId: string;
  }>;
};

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
        {label}
      </span>
      <p className="font-serif text-[2rem] leading-none font-medium tracking-[-0.05em] text-foreground">
        {value}
      </p>
    </div>
  );
}

export default async function SellerPage({ params }: SellerPageProps) {
  const { sellerId } = await params;
  const seller = await getSellerDetail(sellerId);

  if (!seller) {
    notFound();
  }

  return (
    <main className="theme-ember-editorial min-h-screen text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-8 md:px-10">
        <nav className="flex items-center gap-3 text-sm text-muted-foreground">
          <Button asChild variant="ghost" size="xs">
            <Link href="/" className="gap-1.5">
              <ArrowLeft className="size-3" />
              Auctions
            </Link>
          </Button>
          <span className="text-muted-foreground/40">/</span>
          <span className="break-all font-medium text-foreground">
            {seller.sellerId}
          </span>
        </nav>

        <header className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-accent">
            <span>Seller profile</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
              <User className="size-5" />
            </div>
            <h1 className="min-w-0 break-all font-serif text-[2.4rem] leading-[0.92] font-medium tracking-[-0.04em] text-foreground sm:text-[3rem]">
              {seller.sellerId}
            </h1>
            <Badge variant="outline" className="text-xs">
              Rep: {seller.reputationScore}
            </Badge>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-6">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.28em] text-accent">
                  Seller auctions
                </p>
                <h2 className="mt-2 font-serif text-[2.75rem] leading-[0.92] font-medium tracking-[-0.05em]">
                  All signals
                </h2>
              </div>
              <Badge variant="secondary">
                {seller.auctions.length} listed
              </Badge>
            </div>

            {seller.auctions.length > 0 ? (
              <div className="grid gap-5">
                {seller.auctions.map((auction) => (
                  <AuctionCard
                    key={auction.auctionId}
                    auction={auction}
                    href={`/auction/${auction.auctionId}`}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[calc(var(--radius)+6px)] border border-border bg-muted/30 p-6 text-sm leading-7 text-muted-foreground">
                This seller has no auctions yet.
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-8 lg:self-start">
            <Card className="border-border/90 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_96%,transparent),color-mix(in_srgb,var(--secondary)_28%,transparent))]">
              <CardHeader className="pb-0">
                <span className="text-xs font-medium uppercase tracking-[0.22em] text-accent">
                  Reputation
                </span>
              </CardHeader>
              <CardContent>
                <p className="mt-3 font-serif text-[3.2rem] leading-none font-medium tracking-[-0.06em] text-foreground">
                  {seller.reputationScore}
                </p>
                <Separator className="my-5" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
                      Correct
                    </span>
                    <p className="text-sm font-medium text-foreground">
                      {seller.correctPredictions}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
                      Wrong
                    </span>
                    <p className="text-sm font-medium text-foreground">
                      {seller.wrongPredictions}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_98%,transparent),color-mix(in_srgb,var(--secondary)_18%,transparent))]">
              <CardHeader className="pb-0">
                <span className="text-xs font-medium uppercase tracking-[0.22em] text-accent">
                  Statistics
                </span>
              </CardHeader>
              <CardContent className="space-y-5">
                <Separator />
                <div className="grid grid-cols-2 gap-5">
                  <StatCard
                    label="Total auctions"
                    value={seller.totalAuctionCount}
                  />
                  <StatCard
                    label="Open auctions"
                    value={seller.openAuctionCount}
                  />
                  <StatCard
                    label="Total earnings"
                    value={usdFormat.format(seller.totalEarningsUsdc)}
                  />
                  <StatCard
                    label="Unscorable"
                    value={seller.unscorableAuctions}
                  />
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
