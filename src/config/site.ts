import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/site-url";

/**
 * Site-level metadata for the application shell.
 * Brand copy / visual identity (OD-15, OD-16) remain OPEN — keep this minimal.
 */
export const siteConfig = {
  name: "BitRymDym",
  description:
    "Platforma muzyczna — bity, nagrania, mix i społecznościowy katalog.",
} as const;

export const siteMetadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(getSiteUrl()),
  applicationName: siteConfig.name,
  openGraph: {
    type: "website",
    locale: "pl_PL",
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
    url: "/",
    images: [{ url: "/brand/bitrymdym-logo.png", alt: siteConfig.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: ["/brand/bitrymdym-logo.png"],
  },
};
