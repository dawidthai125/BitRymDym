import { getTranslations } from "next-intl/server";

import { listPublishedBeats } from "@/lib/beats/service";
import { OG_CONTENT_TYPE, OG_SIZE, shareCard } from "@/lib/share/og-card";
import { beatsInGenre, collectGenres } from "@/lib/seo/genre-pages";

export const runtime = "nodejs";
export const alt = "BitRymDym";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** Genre share card (1200×630): same free-catalogue data path as the genre page. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [t, share] = await Promise.all([getTranslations("beats.genrePage"), getTranslations("common.share")]);
  const beats = await listPublishedBeats({ catalogLane: "free" }).catch(() => []);
  const genre = collectGenres(beats).find((g) => g.slug === slug) ?? null;
  if (!genre) return shareCard({ kicker: share("ogMarka"), title: "BitRymDym", meta: null, cover: null });
  const count = beatsInGenre(beats, slug).length;
  return shareCard({ kicker: share("ogMarka"), title: t("h1", { genre: genre.label }), meta: t("licznik", { count }), cover: null });
}
