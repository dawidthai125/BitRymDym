import { getTranslations } from "next-intl/server";

import { coverDataUrl, OG_CONTENT_TYPE, OG_SIZE, shareCard } from "@/lib/share/og-card";
import { listenShareData } from "@/lib/share/share-server";

export const runtime = "nodejs";
export const alt = "BitRymDym";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** Dynamic share card (cover only when publicly visible). */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("common.share");
  const d = await listenShareData(token);
  return shareCard({ kicker: t("ogOdsluch"), title: d?.title || "BitRymDym", meta: d?.meta ?? null, cover: await coverDataUrl(d?.cover) });
}
