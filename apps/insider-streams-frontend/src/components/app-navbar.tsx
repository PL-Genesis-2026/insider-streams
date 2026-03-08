import Link from "next/link";
import { Logo } from "@/components/logo";
import { WalletAccountControl } from "@/components/wallet/wallet-account-control";
import { RevealPrivateDataButton } from "@/components/reveal-private-data-button";

export function AppNavbar() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:gap-6 sm:px-6 md:px-10">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Logo />
        </Link>
        <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
          <Link
            href="/create"
            className="hidden text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-100 ease-out hover:text-foreground md:inline-flex"
          >
            Sell
          </Link>
          <Link
            href="/#auctions"
            className="hidden text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-100 ease-out hover:text-foreground sm:inline-flex"
          >
            Auctions
          </Link>
          <Link
            href="/dashboard"
            className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-100 ease-out hover:text-foreground"
          >
            Dashboard
          </Link>
          <RevealPrivateDataButton />
          <WalletAccountControl />
        </div>
      </nav>
    </header>
  );
}
