import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/site/site-header";
import {
  MAIN_CONTENT_ID,
  MAIN_CONTENT_LANDMARK_CLASS,
} from "@/components/site/skip-to-main";
import { getCurrentProfile } from "@/lib/auth/session";
import { listMyDownloadHistory } from "@/lib/downloads/history";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import { intlTag, resolveLocale } from "@/i18n/config";

function formatDownloadedAt(iso: string, tag = "pl-PL"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(tag, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

export default async function MyDownloadsPage() {
  const t = await getTranslations("account.accountDownloadsPage");
  const tag = intlTag(resolveLocale(await getLocale()));
  const env = getSupabasePublicEnv();
  if (!env.isConfigured) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">{t("mojePobrane")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("uslugaJestChwilowoNiedostepna")}
        </p>
        <Link href="/" className="text-sm underline underline-offset-4">
          {t("stronaGlowna")}
        </Link>
      </main>
    );
  }

  const context = await getCurrentProfile();
  if (!context) {
    redirect("/sign-in");
  }

  const items = await listMyDownloadHistory();

  return (
    <div className="min-h-dvh bg-[var(--brd-paper)] text-[var(--brd-ink)]">
      <SiteHeader />
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10",
          MAIN_CONTENT_LANDMARK_CLASS,
        )}
      >
        <div className="space-y-2">
          <Link
            href="/account"
            className="w-fit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("konto")}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{t("mojePobrane")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("minimalnaHistoriaPobranZalogowanego")}
          </p>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("niePobranoJeszczeZadnych")}
          </p>
        ) : (
          <ul className="divide-y divide-border/80 border-y border-border/80">
            {items.map((item) => (
              <li key={item.beatId} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="space-y-1">
                  <Link
                    href={`/beat/${item.beatId}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </Link>
                  {item.producer ? (
                    <p className="text-sm text-muted-foreground">{item.producer}</p>
                  ) : null}
                </div>
                <time
                  className="text-xs text-muted-foreground tabular-nums"
                  dateTime={item.lastDownloadedAt}
                >
                  {formatDownloadedAt(item.lastDownloadedAt, tag)} {t("utc")}
                </time>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
