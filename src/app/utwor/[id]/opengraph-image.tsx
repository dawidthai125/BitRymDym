import { getTranslations } from "next-intl/server";

import { coverDataUrl, OG_CONTENT_TYPE, OG_SIZE, shareCard } from "@/lib/share/og-card";
import { workShareData } from "@/lib/share/share-server";

export const runtime = "nodejs";
export const alt = "BitRymDym";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** Dynamic share card for a finished track (live works only; beat cover only when public). */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("common.share");
  const d = await workShareData(id);
  // Hidden / withdrawn / unknown → neutral brand card (nothing about the work leaks).
  if (!d) return shareCard({ kicker: t("ogMarka"), title: "BitRymDym", meta: null, cover: null });
  return shareCard({ kicker: t("ogUtwor"), title: d.title || "BitRymDym", meta: d.meta, cover: await coverDataUrl(d.cover) });
}
