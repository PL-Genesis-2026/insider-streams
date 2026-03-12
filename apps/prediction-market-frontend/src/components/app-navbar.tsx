"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletAccountControl } from "@/components/wallet/wallet-account-control";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Markets" },
  { href: "/settlements", label: "Settlements" },
] as const;

export function AppNavbar() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-3 md:px-10">
        <div className="flex items-center gap-8">
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
          <div className="flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/" || pathname.startsWith("/events")
                  : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] transition-colors duration-100 ease-out",
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
        <WalletAccountControl />
      </nav>
    </header>
  );
}
