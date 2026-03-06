import type { Metadata } from "next";
import {
  Cormorant_Garamond,
  Geist,
  Geist_Mono,
  Instrument_Sans,
} from "next/font/google";
import { AppNavbar } from "@/components/app-navbar";
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
  title: "Insider Streams",
  description: "Signal auctions for prediction markets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${emberDisplay.variable} ${emberBody.variable} theme-ember-editorial antialiased`}
      >
        <Providers>
          <TooltipProvider>
            <AppNavbar />
            {children}
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
