import type { MetadataRoute } from "next";

import { getPublicSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = getPublicSiteUrl();
  return {
    rules: {
      userAgent: "*",
      // Beat covers live under /api/ but are public images (Google Images, JSON-LD image).
      allow: ["/", "/api/beats/*/cover"],
      disallow: [
        "/api/",
        "/admin",
        "/account",
        "/settings",
        "/library",
        "/studio",
        "/auth/",
        "/listen/",
        "/r/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
