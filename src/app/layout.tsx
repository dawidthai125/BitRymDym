import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { ClientProviders } from "@/components/site/client-providers";
import { siteMetadata } from "@/config/site";
import { cn } from "@/lib/utils";

import "./globals.css";

/**
 * Geist is a temporary technical default from the scaffold/shadcn setup.
 * Final brand typography = OD-15 / OD-16 — OPEN. Do not treat as Design System.
 *
 * M2: ClientProviders wraps the tree so Fala 4 / StickyMiniPlayer share PlayerProvider.
 * BRD visual DNA (fonts/tokens/grain) stays out of this pack.
 */
const geist = Geist({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
});

export const metadata: Metadata = siteMetadata;

/** W6.2: enable env(safe-area-inset-*) on notched devices. */
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className={cn("font-sans", geist.variable)}>
      <body className="min-h-dvh pb-[env(safe-area-inset-bottom)] antialiased">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
