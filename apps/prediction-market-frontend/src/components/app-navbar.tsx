import Link from "next/link";
import { WalletAccountControl } from "@/components/wallet/wallet-account-control";

export function AppNavbar() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-4 md:px-10">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <span className="inline-flex items-center gap-2.5">
            <span className="flex flex-col whitespace-nowrap leading-[0.84]">
              <span className="font-serif text-[1.36rem] font-medium italic tracking-[-0.04em] text-primary/90">
                Bolly
              </span>
              <span className="mt-0.5 font-serif text-[0.86rem] font-bold uppercase tracking-[0.28em] text-foreground">
                Market
              </span>
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-100 ease-out hover:text-foreground"
          >
            Events
          </Link>
          <Link
            href="/settlements"
            className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-100 ease-out hover:text-foreground"
          >
            Settlements
          </Link>
          <WalletAccountControl />
        </div>
      </nav>
    </header>
  );
}
