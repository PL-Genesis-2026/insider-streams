import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { WalletAccountControl } from "@/components/wallet/wallet-account-control";

export function AppNavbar() {
  return (
    <header className="border-b border-border/60">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-4 md:px-10">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Logo />
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/create"
            className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-100 ease-out hover:text-foreground"
          >
            Sell
          </Link>
          <Link
            href="/#auctions"
            className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-100 ease-out hover:text-foreground"
          >
            Auctions
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link href="/funding">Fund wallet</Link>
          </Button>
          <WalletAccountControl />
        </div>
      </nav>
    </header>
  );
}
