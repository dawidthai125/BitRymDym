import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["music-metadata", "@audio/beat", "audio-decode"],
};

export default nextConfig;
