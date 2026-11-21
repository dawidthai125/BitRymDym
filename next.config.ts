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
      // Content-hashed worker bundles.
      { source: "/workers/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
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
