import type { MetadataRoute } from "next";

import { getPublicSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = getPublicSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/account",
        "/settings",
        "/library",
        "/studio",
        "/auth/",
        "/listen/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
