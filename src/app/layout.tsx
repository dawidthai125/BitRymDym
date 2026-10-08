import type { Metadata } from "next";
import {
  IBM_Plex_Mono,
  Schibsted_Grotesk,
  Source_Serif_4,
} from "next/font/google";

import { ClientProviders } from "@/components/site/client-providers";
import { siteMetadata } from "@/config/site";
import { cn } from "@/lib/utils";

import "./globals.css";

/**
 * Phase 7.1.2 / OD-P7.1-01 = B — brand typography (next/font build-time).
 * Semantic CSS vars (set here, consumed in tokens/globals — no circular refs):
 *   --font-brd-display → Source Serif 4
 *   --font-brd-ui      → Schibsted Grotesk
 *   --font-brd-meta    → IBM Plex Mono
 */
const fontDisplay = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  variable: "--font-brd-display",
  display: "swap",
});

const fontUi = Schibsted_Grotesk({
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  variable: "--font-brd-ui",
  display: "swap",
});

const fontMeta = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-brd-meta",
  display: "swap",
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
    <html
      lang="pl"
      className={cn(
        "font-sans",
        fontDisplay.variable,
        fontUi.variable,
        fontMeta.variable,
      )}
    >
      <body className="min-h-dvh pb-[env(safe-area-inset-bottom)] antialiased">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
