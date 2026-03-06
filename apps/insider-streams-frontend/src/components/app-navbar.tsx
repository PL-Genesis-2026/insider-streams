import Link from "next/link";
import { Logo } from "@/components/logo";

export function AppNavbar() {
  return (
    <header className="border-b border-border/60">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-4 md:px-10">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Logo />
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/#auctions"
            className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-100 ease-out hover:text-foreground"
          >
            Auctions
          </Link>
          <div className="rounded-[calc(var(--radius)-6px)] border border-border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Connect wallet
          </div>
        </div>
      </nav>
    </header>
  );
}
