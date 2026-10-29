import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  serverExternalPackages: ["music-metadata", "@audio/beat", "audio-decode"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.png", permanent: true }];
  },
};

export default nextConfig;
