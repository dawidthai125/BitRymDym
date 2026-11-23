import type { MetadataRoute } from "next";

import { getPublicSiteUrl } from "@/lib/site-url";

const PRIVATE = ["/api/", "/admin", "/account", "/settings", "/library", "/studio", "/auth/", "/listen/", "/r/"];
/** Beat covers live under /api/ but are public images (Google Images, JSON-LD image). */
const ALLOW = ["/", "/api/beats/*/cover"];

/** SEO index crawlers: no visitors come from them, and AhrefsBot alone made 3.4k requests a day. */
export const SEO_CRAWLERS = [
  "AhrefsBot", "SemrushBot", "SemrushBot-SA", "MJ12bot", "DotBot", "BLEXBot", "DataForSeoBot",
  "SeekportBot", "serpstatbot", "Barkrowler", "ZoominfoBot", "PetalBot", "Bytespider", "MegaIndex.ru",
];
/** AI crawlers may read the site (answers can cite it), but not ~3000 rhyme pages one by one. */
export const AI_CRAWLERS = ["ClaudeBot", "GPTBot", "CCBot", "Amazonbot", "meta-externalagent", "PerplexityBot", "Applebot-Extended"];

export default function robots(): MetadataRoute.Robots {
  const base = getPublicSiteUrl();
  return {
    rules: [
      { userAgent: "*", allow: ALLOW, disallow: PRIVATE },
      // A named group replaces "*", so the private paths are repeated.
      { userAgent: AI_CRAWLERS, allow: ALLOW, disallow: [...PRIVATE, "/rymy/"], crawlDelay: 10 },
      { userAgent: SEO_CRAWLERS, disallow: ["/"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
