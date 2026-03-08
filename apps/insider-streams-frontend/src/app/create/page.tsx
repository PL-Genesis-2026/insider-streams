import type { Metadata } from "next";
import { CreateAuctionDraftForm } from "@/components/create-auction/create-auction-draft-form";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Create Auction | Insider Streams",
  description: "Sell a private signal on a prediction market event",
};

type CreateAuctionPageSearchParams = Promise<{
  eventId?: string;
  privateLeg?: string;
}>;

function getInitialEventId(value?: string): string | undefined {
  if (!value) return undefined;
  return /^\d+$/.test(value) ? value : undefined;
}

function getInitialPrivateLeg(value?: string): "yes" | "no" | undefined {
  return value === "yes" || value === "no" ? value : undefined;
}

export default async function CreateAuctionPage({
  searchParams,
}: {
  searchParams: CreateAuctionPageSearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const initialEventId = getInitialEventId(resolvedSearchParams.eventId);
  const initialPrivateLeg = getInitialPrivateLeg(
    resolvedSearchParams.privateLeg,
  );
  const isDeepLinkedFromTrade =
    initialEventId !== undefined || initialPrivateLeg !== undefined;

  return (
    <main className="min-h-screen">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pt-8 pb-12 md:px-10 md:pt-12">
        <div className="max-w-4xl space-y-4">
          {isDeepLinkedFromTrade && (
            <Badge
              variant="outline"
              className="border-accent/30 bg-accent/10 text-accent"
            >
              From trade
            </Badge>
          )}
          <h1 className="font-serif text-[3.6rem] leading-[0.9] font-medium tracking-[-0.055em] text-foreground sm:text-[4.8rem]">
            Sell your signal
          </h1>
        </div>
      </section>
      <CreateAuctionDraftForm
        initialEventId={initialEventId}
        initialPrivateLeg={initialPrivateLeg}
        isDeepLinkedFromTrade={isDeepLinkedFromTrade}
      />
    </main>
  );
}
