import type { Metadata } from "next";
import { CreateAuctionDraftForm } from "@/components/create-auction/create-auction-draft-form";

export const metadata: Metadata = {
  title: "Create Auction | Insider Streams",
  description: "Sell a private signal on a prediction market event",
};

export default function CreateAuctionPage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pt-16 pb-12 md:px-10 md:pt-24">
        <div className="max-w-4xl space-y-4">
          <h1 className="font-serif text-[3.6rem] leading-[0.9] font-medium tracking-[-0.055em] text-foreground sm:text-[4.8rem]">
            Create an auction
          </h1>
          <p className="max-w-3xl text-[1.06rem] leading-8 text-muted-foreground">
            Pick a prediction market event, declare your position, and describe
            the signal. Your seller identity is automatically created and locked
            to your wallet on your first listing.
          </p>
        </div>
      </section>
      <CreateAuctionDraftForm />
    </main>
  );
}
