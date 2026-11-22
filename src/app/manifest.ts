import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

/** Dark theme paper / ink (html[data-theme="dark"] --brd-paper, src/styles/tokens.css). */
const PWA_BACKGROUND_COLOR = "#0e0c0a";
const PWA_THEME_COLOR = "#0e0c0a";

/** Web app manifest → /manifest.webmanifest (installable PWA; store apps open start_url?app=…). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: "Bity, nagrywanie w przeglądarce, mix i mastering. Wbijasz, nagrywasz, wrzucasz.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    lang: "pl",
    dir: "ltr",
    categories: ["music", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Logo inside the ~80% safe zone, so circle/squircle masks never clip it.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Studio",
        short_name: "Studio",
        description: "Nagrywaj i miksuj w Studiu",
        url: "/studio",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Bity",
        short_name: "Bity",
        description: "Katalog bitów",
        url: "/beats",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
