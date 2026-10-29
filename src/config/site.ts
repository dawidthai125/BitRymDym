import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

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

export async function getSiteMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  const description = t("siteDescription");
  return {
    title: {
      default: siteConfig.name,
      template: `%s · ${siteConfig.name}`,
    },
    description,
    metadataBase: new URL(getSiteUrl()),
    applicationName: siteConfig.name,
    openGraph: {
      type: "website",
      locale: t("ogLocale"),
      siteName: siteConfig.name,
      title: siteConfig.name,
      description,
      url: "/",
      images: [{ url: "/brand/bitrymdym-logo.png", alt: siteConfig.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: siteConfig.name,
      description,
      images: ["/brand/bitrymdym-logo.png"],
    },
  };
}
