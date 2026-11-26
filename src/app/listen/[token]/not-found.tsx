import { getTranslations } from "next-intl/server";

/** Unknown, expired, revoked or rate-limited listen link: HTTP 404 with a neutral message (no oracle). */
export default async function ListenNotFound() {
  const t = await getTranslations("listen");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-6 py-12" data-testid="listen-page">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{t("marka")}</p>
      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-6" data-testid="listen-unavailable">
        <h1 className="text-xl font-semibold tracking-tight">{t("niedostepnyTytul")}</h1>
        <p className="text-sm text-muted-foreground">{t("niedostepnyOpis")}</p>
      </section>
    </main>
  );
}
