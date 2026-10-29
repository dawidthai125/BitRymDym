import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

/** Public, indexable pages only (no auth-gated or API routes). */
const PUBLIC_PATHS = ["/", "/beats", "/about", "/premium", "/sign-in", "/sign-up"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return PUBLIC_PATHS.map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    changeFrequency: path === "/beats" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
