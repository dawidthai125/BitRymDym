import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getPublicSiteUrl } from "@/lib/site-url";

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
    metadataBase: new URL(getPublicSiteUrl()),
    applicationName: siteConfig.name,
    // PWA on iPhone (Add to Home Screen): own title + full-screen launch (manifest: src/app/manifest.ts).
    appleWebApp: { capable: true, title: siteConfig.name, statusBarStyle: "black" },
    openGraph: {
      type: "website",
      locale: t("ogLocale"),
      siteName: siteConfig.name,
      title: siteConfig.name,
      description,
      // No site-wide og:url: it made every shared page point at the homepage.
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: siteConfig.name,
      description,
      images: [DEFAULT_OG_IMAGE.url],
    },
  };
}

/** Default share card (1200×630, `src/app/opengraph-image.tsx` → `og-card`). */
export const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: siteConfig.name,
} as const;

type OgImage = { url: string; width?: number; height?: number; alt?: string };

/**
 * Per-page SEO metadata (one place): own title + description, canonical path
 * without query, Open Graph (title, description, url, image) and Twitter.
 * Page-level `openGraph` replaces the layout one (shallow merge), so the
 * shared fields (siteName, locale, type) are repeated here.
 */
export async function pageMetadata(p: {
  title: string;
  description: string;
  /** Canonical path, no query string (e.g. "/ranking", not "/ranking?okres=miesiac"). */
  path: string;
  /** Use the title as is, without the " · BitRymDym" template (also automatic when it already names the brand). */
  absoluteTitle?: boolean;
  image?: OgImage;
}): Promise<Metadata> {
  const t = await getTranslations("meta");
  const asIs = p.absoluteTitle || p.title.includes(siteConfig.name);
  const fullTitle = asIs ? p.title : `${p.title} · ${siteConfig.name}`;
  const image = p.image ?? DEFAULT_OG_IMAGE;
  const path = p.path.split(/[?#]/)[0] || "/";
  return {
    title: asIs ? { absolute: p.title } : p.title,
    description: p.description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: t("ogLocale"),
      siteName: siteConfig.name,
      title: fullTitle,
      description: p.description,
      url: path,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: p.description,
      images: [image.url],
    },
  };
}
