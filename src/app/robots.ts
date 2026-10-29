import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
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
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
