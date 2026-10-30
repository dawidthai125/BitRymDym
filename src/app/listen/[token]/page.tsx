import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { ListenPlayer } from "@/components/listen/listen-player";
import { resolveListenToken } from "@/lib/studio/listen/listen-server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("listen");
  const description = t("tylkoOdsluch");
  // Card image: ./opengraph-image + ./twitter-image (title + public beat cover only). Still noindex.
  return {
    title: t("metaTitle"), description, robots: { index: false, follow: false }, referrer: "no-referrer",
    openGraph: { type: "website", title: t("metaTitle"), description },
    twitter: { card: "summary_large_image", title: t("metaTitle"), description },
  };
}

/** Gaps P1 — public, auth-free player for a private listen link (no download, no BITEK). */
export default async function ListenPage({ params }: Props) {
  const { token } = await params;
  const t = await getTranslations("listen");
  const format = await getFormatter();
  const link = await resolveListenToken(token).catch(() => null);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-6 py-12" data-testid="listen-page">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{t("marka")}</p>
      {link ? (
        <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{t("prywatnyOdsluch")}</p>
            <h1 className="text-2xl font-semibold tracking-tight break-words">{link.title || t("bezTytulu")}</h1>
          </div>
          <ListenPlayer src={`/api/listen/${encodeURIComponent(token)}/audio`} label={t("odtwarzacz")} />
          <p className="text-xs text-muted-foreground">
            {t("wygasa", { kiedy: format.dateTime(new Date(link.expiresAt), { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Warsaw" }) })}
          </p>
          <p className="text-xs text-muted-foreground">{t("tylkoOdsluch")}</p>
        </section>
      ) : (
        <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-6" data-testid="listen-unavailable">
          <h1 className="text-xl font-semibold tracking-tight">{t("niedostepnyTytul")}</h1>
          <p className="text-sm text-muted-foreground">{t("niedostepnyOpis")}</p>
        </section>
      )}
    </main>
  );
}
