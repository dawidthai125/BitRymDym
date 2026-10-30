import { readFileSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");

/** Report-Only first: observe violations before enforcing. */
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin} https://vercel.com https://vercel.live`,
  "font-src 'self' data:",
  `media-src 'self' blob: mediastream: data: ${supabaseOrigin}`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs} https://vercel.live wss://ws-us3.pusher.com https://vitals.vercel-insights.com`,
  "worker-src 'self' blob:",
  "frame-src https://vercel.live",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
]
  .join("; ")
  .replace(/\s+/g, " ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
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
  serverExternalPackages: ["music-metadata", "@audio/beat", "audio-decode"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Content-hashed worker bundles.
      { source: "/workers/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.png", permanent: true }];
  },
};

export default withNextIntl(nextConfig);
