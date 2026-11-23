import Link from "@/components/ui/app-link";
import { getLocale, getTranslations } from "next-intl/server";

import { SectionLabel } from "@/components/brand/chrome";
import { listOwnFinishedTracks } from "@/lib/studio/own-finished-tracks";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Finished Studio tracks (approved masters) on the account page. */
export async function OwnStudioTracks({ userId }: { userId: string }) {
  const t = await getTranslations("account.accountPage");
  const locale = await getLocale();
  const tracks = await listOwnFinishedTracks(createSupabaseAdminClient(), userId).catch((e: unknown) => {
    console.error("[account] own tracks failed", e instanceof Error ? e.message : e);
    return null;
  });
  const fmt = (iso: string) => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? new Date(ms).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "Europe/Warsaw" }) : "";
  };
  return (
    <section className="space-y-3 pt-8" data-testid="account-own-tracks">
      <SectionLabel>{t("mojeUtwory")}</SectionLabel>
      {tracks === null ? (
        <p className="text-sm text-[var(--brd-mute)]">{t("mojeUtworyBlad")}</p>
      ) : tracks.length === 0 ? (
        <p className="text-sm text-[var(--brd-mute)]">{t("mojeUtworyPusto")}</p>
      ) : (
        <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
          {tracks.map((track) => (
            <li key={track.masterJobId} className="flex flex-wrap items-center justify-between gap-2 py-3" data-testid="account-own-track">
              <div className="min-w-0">
                <p className="brd-display truncate text-base">{track.title}</p>
                <p className="text-xs text-[var(--brd-mute)]">
                  {t("zatwierdzony", { date: fmt(track.approvedAt) })} · {track.listed ? t("wKatalogu") : t("poZa")}
                </p>
              </div>
              <Link href={`/studio/p/${track.projectId}`} className="text-sm text-[var(--brd-green)] hover:underline">
                {t("otworzWStudio")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
