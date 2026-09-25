import type { Metadata } from "next";

/**
 * Site-level metadata for the application shell.
 * Brand copy / visual identity (OD-15, OD-16) remain OPEN — keep this minimal.
 */
export const siteConfig = {
  name: "BitRymDym",
  description:
    "Platforma muzyczna — rap, hip-hop i bity. Publiczny katalog i odsłuch PUBLISHED (Phase 1.6).",
} as const;

export const siteMetadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
};
