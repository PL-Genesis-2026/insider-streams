import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Create Auction | Insider Streams",
  description: "Seller listing status for Insider Streams",
};

export default function CreateAuctionPage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 pt-16 pb-20 md:px-10 md:pt-24">
        <Badge variant="outline" className="w-fit">
          Seller listings unavailable
        </Badge>
        <div className="space-y-4">
          <h1 className="font-serif text-[3.6rem] leading-[0.9] font-medium tracking-[-0.055em] text-foreground sm:text-[4.8rem]">
            Listing creation
            <br />
            <span className="italic text-primary/80">is not live yet</span>
          </h1>
          <p className="max-w-3xl text-[1.06rem] leading-8 text-muted-foreground">
            The prototype seller form was removed because it looked like a real
            product flow, but there is no backing API or onchain listing path for
            it yet. Seller auction creation should stay hidden until the end to
            end flow actually exists.
          </p>
        </div>
        <div className="rounded-[calc(var(--radius)+6px)] border border-border bg-muted/25 p-6 text-sm leading-7 text-muted-foreground">
          Buyers can still fund wallets and bid on live auctions. Once seller
          creation is implemented for real, this route can be replaced with the
          actual authenticated listing flow.
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/#auctions">Browse auctions</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/funding">Fund wallet</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
