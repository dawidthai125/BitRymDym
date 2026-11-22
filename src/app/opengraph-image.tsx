import { getTranslations } from "next-intl/server";

import { OG_CONTENT_TYPE, OG_SIZE, shareCard } from "@/lib/share/og-card";

export const runtime = "nodejs";
export const alt = "BitRymDym";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** Default share card (1200×630) for the home page and every page without its own image. */
export default async function Image() {
  const t = await getTranslations("common.share");
  const m = await getTranslations("meta");
  return shareCard({ kicker: t("ogMarka"), title: "BitRymDym", meta: m("siteDescription"), cover: null });
}
