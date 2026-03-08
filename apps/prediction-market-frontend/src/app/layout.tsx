import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  Cormorant_Garamond,
  Geist,
  Geist_Mono,
  Instrument_Sans,
} from "next/font/google";
import { AppNavbar } from "@/components/app-navbar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const emberDisplay = Cormorant_Garamond({
  variable: "--font-ember-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const emberBody = Instrument_Sans({
  variable: "--font-ember-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Bollymarket — Prediction Market",
  description:
    "Trade on prediction market outcomes. Buy Yes/No shares and sell your signal on Insider Streams.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const cookies = requestHeaders.get("cookie");

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${emberDisplay.variable} ${emberBody.variable} theme-bollymarket`}
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${emberDisplay.variable} ${emberBody.variable} theme-bollymarket antialiased`}
      >
        <Providers cookies={cookies}>
          <TooltipProvider>
            <AppNavbar />
            <main className="pt-16">
              {children}
            </main>
            <Toaster />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
