import { readFileSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// CSP (nonce-based, per request) is set in src/middleware.ts via src/lib/security/csp.ts.

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=()",
  },
];

/** Prebuilt Studio Web Workers (scripts/build-studio-workers.mjs, run by predev/prebuild). */
const studioWorkers = (() => {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "public", "workers", "manifest.json"), "utf8")) as Partial<
      Record<"master" | "mixAnalysis", string>
    >;
  } catch {
    // Missing manifest → empty URLs → Studio computes on the main thread.
    return {};
  }
})();

const nextConfig: NextConfig = {
  // Set only by .github/workflows/deploy.yml: a prebuilt deploy has no Vercel build, so Skew Protection needs our own id.
  deploymentId: process.env.BRD_DEPLOYMENT_ID || undefined,
  env: {
    NEXT_PUBLIC_STUDIO_MASTER_WORKER_URL: studioWorkers.master ?? "",
    NEXT_PUBLIC_STUDIO_MIX_ANALYSIS_WORKER_URL: studioWorkers.mixAnalysis ?? "",
  },
  // Client router: keep dynamic admin/studio tab payloads briefly so back/forth
  // switches reuse RSC instead of freezing on a full refetch (Next 15+ default dynamic: 0).
  experimental: {
    staleTimes: {
      dynamic: 45,
      static: 180,
    },
  },
  serverExternalPackages: ["music-metadata", "@audio/beat", "audio-decode"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Private listen links (2026-11-26): never indexed, never cached, the token never leaks in a Referer.
      // Listed after the global block so this Referrer-Policy wins.
      ...["/listen/:path*", "/api/listen/:path*"].map((source) => ({
        source,
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      })),
      // Same for everyone and not in the middleware matcher: the CDN answers, not the server.
      ...["/sitemap.xml", "/robots.txt"].map((source) => ({
        source,
        headers: [{ key: "Vercel-CDN-Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" }],
      })),
      // Content-hashed worker bundles.
      { source: "/workers/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // PWA service worker (public/sw.js): always revalidated so an update ships on the next visit;
      // own CSP (the worker only fetches same-origin pages and icons).
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/favicon.ico", destination: "/icon.png", permanent: true },
      { source: "/samples", destination: "/sampel", permanent: true },
      { source: "/samples/:path*", destination: "/sampel", permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
