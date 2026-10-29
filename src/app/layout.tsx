import type { Metadata } from "next";
import {
  Big_Shoulders,
  IBM_Plex_Mono,
  Schibsted_Grotesk,
  Source_Serif_4,
} from "next/font/google";
import Script from "next/script";

import { ClientProviders } from "@/components/site/client-providers";
import { siteMetadata } from "@/config/site";
import { BRD_THEME_BOOT_SCRIPT } from "@/lib/ui/theme";
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

/** Design v3 "Nocna sesja" — condensed poster face (homepage prototype first). */
const fontPoster = Big_Shoulders({
  subsets: ["latin", "latin-ext"],
  weight: "variable",
  variable: "--font-brd-poster",
  display: "swap",
  // No metric overrides exist for Big Shoulders → own condensed fallback stack.
  adjustFontFallback: false,
  fallback: ["Arial Narrow", "Roboto Condensed", "sans-serif-condensed", "sans-serif"],
});

export const metadata: Metadata = siteMetadata;

/** W6.2: enable env(safe-area-inset-*) on notched devices. */
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  colorScheme: "dark light" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pl"
      data-theme="dark"
      className={cn(
        "dark font-sans",
        fontDisplay.variable,
        fontUi.variable,
        fontMeta.variable,
        fontPoster.variable,
      )}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-[var(--brd-paper)] pb-[env(safe-area-inset-bottom)] text-[var(--brd-ink)] antialiased">
        <Script
          id="brd-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: BRD_THEME_BOOT_SCRIPT }}
        />
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
