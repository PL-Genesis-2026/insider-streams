export const dynamic = "force-dynamic";
import Image from "next/image";
import { AuctionCard } from "@/components/auction-card";
import { Badge } from "@/components/ui/badge";
import { LogoMark } from "@/components/logo";
import { getHomepageAuctions } from "@/lib/homepage-auctions";

const OPEN_AUCTION_CARD_LIMIT = 6;
const CLOSED_AUCTION_CARD_LIMIT = 4;

export default async function Home() {
  let data: Awaited<ReturnType<typeof getHomepageAuctions>> | null = null;

  try {
    data = await getHomepageAuctions({
      openLimit: OPEN_AUCTION_CARD_LIMIT,
      closedLimit: CLOSED_AUCTION_CARD_LIMIT,
    });
  } catch (error) {
    console.error("Failed to load homepage auctions", error);
  }

  const openAuctions = data?.open ?? [];
  const closedAuctions = data?.closed ?? [];

  return (
    <div className="min-h-screen text-foreground">
      <main>
        <section className="relative mx-auto w-full max-w-7xl overflow-hidden px-6 pt-16 pb-12 md:px-10 md:pt-24 md:pb-20">
          <div
            className="pointer-events-none absolute top-[6%] right-[2%] h-[76%] w-[48%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(195,146,110,0.16),transparent_68%)] blur-2xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute top-0 right-0 bottom-0 left-[38%] select-none mix-blend-lighten"
            aria-hidden="true"
            style={{
              maskImage:
                "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.06) 16%, black 44%, black 78%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 12%, black 86%, transparent 100%)",
              maskComposite: "intersect",
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.06) 16%, black 44%, black 78%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 12%, black 86%, transparent 100%)",
              WebkitMaskComposite: "source-in",
            }}
          >
            <Image
              src="/hero-illustration.svg"
              alt=""
              width={1536}
              height={1024}
              priority
              className="absolute top-1/2 left-[-16%] h-auto w-[120%] max-w-none -translate-y-[46%] opacity-[0.44] saturate-[0.8] lg:left-[-12%] lg:w-[114%]"
            />
          </div>

          <div className="relative max-w-4xl space-y-6">
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-accent">
              Signal marketplace
            </p>
            <h1 className="font-serif text-[3.8rem] leading-[0.88] font-medium tracking-[-0.055em] text-foreground sm:text-[5.5rem]">
              Trade on what
              <br />
              <span className="italic text-primary/80">others know</span>
            </h1>
            <p className="max-w-2xl text-[1.12rem] leading-8 text-muted-foreground">
              Insider Streams is an auction marketplace for information signals
              tied to prediction market outcomes. Sellers list what they know,
              buyers bid on the edge.
            </p>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-2 text-sm text-muted-foreground">
              <div>
                <span className="font-serif text-[2rem] leading-none font-medium tracking-[-0.04em] text-foreground">
                  {openAuctions.length}
                </span>
                <span className="ml-2 text-xs uppercase tracking-[0.22em] text-accent">
                  Open
                </span>
              </div>
              <div className="h-6 w-px bg-border" />
              <div>
                <span className="font-serif text-[2rem] leading-none font-medium tracking-[-0.04em] text-foreground">
                  {closedAuctions.length}
                </span>
                <span className="ml-2 text-xs uppercase tracking-[0.22em] text-accent">
                  Closed
                </span>
              </div>
              <div className="h-6 w-px bg-border" />
              <div>
                <span className="font-serif text-[2rem] leading-none font-medium tracking-[-0.04em] text-foreground">
                  {openAuctions.length + closedAuctions.length}
                </span>
                <span className="ml-2 text-xs uppercase tracking-[0.22em] text-accent">
                  Total listings
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          id="auctions"
          className="mx-auto w-full max-w-7xl px-6 pb-16 md:px-10"
        >
          <div className="flex items-end justify-between gap-6 border-t border-border pt-8 pb-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.28em] text-accent">
                Live auctions
              </p>
              <h2 className="mt-2 font-serif text-[2.75rem] leading-[0.92] font-medium tracking-[-0.05em]">
                Open signals
              </h2>
            </div>
            <Badge variant="accent">{openAuctions.length} active</Badge>
          </div>

          {openAuctions.length > 0 ? (
            <div className="grid gap-5">
              {openAuctions.map((auction) => (
                <AuctionCard
                  key={auction.auctionId}
                  auction={auction}
                  href={`/auction/${auction.auctionId}`}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[calc(var(--radius)+6px)] border border-border bg-muted/30 p-6 text-sm leading-7 text-muted-foreground">
              No open auctions right now.
            </div>
          )}

          {closedAuctions.length > 0 ? (
            <>
              <div className="mt-12 flex items-end justify-between gap-6 border-t border-border pt-8 pb-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.28em] text-accent">
                    Closed
                  </p>
                  <h2 className="mt-2 font-serif text-[2.75rem] leading-[0.92] font-medium tracking-[-0.05em]">
                    Closed auctions
                  </h2>
                </div>
                <Badge variant="secondary">
                  {closedAuctions.length} closed
                </Badge>
              </div>

              <div className="grid gap-5">
                {closedAuctions.map((auction) => (
                  <AuctionCard
                    key={auction.auctionId}
                    auction={auction}
                    href={`/auction/${auction.auctionId}`}
                  />
                ))}
              </div>
            </>
          ) : null}
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-6 md:px-10">
          <LogoMark
            width={16}
            height={16}
            className="text-muted-foreground/40"
            aria-hidden="true"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
            <span>Built on</span>
            <span className="font-medium text-muted-foreground">
              Chainlink CRE
            </span>
            <span className="text-muted-foreground/30">+</span>
            <span className="font-medium text-muted-foreground">
              Ethereum Sepolia
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
