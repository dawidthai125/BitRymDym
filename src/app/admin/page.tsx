import { useLibText } from "@/i18n/use-lib-text";
import { getLibText } from "@/i18n/get-lib-text";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  PageFrame,
  SectionLabel,
  StatusPill,
} from "@/components/brand/chrome";
import { BrdLink } from "@/components/brand/brd-button";
import { getCurrentProfile } from "@/lib/auth/session";
import { canAccessAdminNav, canAccessModerationNav } from "@/lib/auth/permissions";
import { listPlatformBeatsForAdmin } from "@/lib/beats/service";
import { formatDurationSeconds } from "@/lib/beats/public";
import { labelAudioReady, labelBeatStatus } from "@/lib/ui/labels";

/**
 * Pulpit Panelu Administracyjnego — presentation over existing admin services.
 */
export default async function AdminIndexPage() {
  const tl = await getLibText();
  const t = await getTranslations("admin.adminPage");
  const context = await getCurrentProfile();
  const role = context?.profile.role;
  const showPlatform = canAccessAdminNav(role);
  const showModeration = canAccessModerationNav(role);

  if (!showPlatform && showModeration) {
    redirect("/admin/moderation");
  }
  if (!showPlatform && !showModeration) {
    redirect("/sign-in");
  }

  const beats = showPlatform ? await listPlatformBeatsForAdmin() : [];
  const readyCount = beats.filter((b) => b.activeMasterReady).length;

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--brd-line)] pb-6">
          <div className="space-y-2">
            <h1 className="brd-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("pulpit")}
            </h1>
            <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
              {t("zarzadzajBitamiModeracjaI")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <BrdLink href="/admin/beats/new">{t("nowyBit")}</BrdLink>
            <BrdLink href="/admin/moderation" variant="secondary">
              {t("moderacja")}
            </BrdLink>
          </div>
        </header>

        <div className="mb-10 grid grid-cols-2 gap-px border border-[var(--brd-line)] bg-[var(--brd-line)] sm:grid-cols-4">
          <AdminStat label={t("bity")} value={String(beats.length)} />
          <AdminStat label={t("gotoweAudio")} value={String(readyCount)} />
          <AdminStat label={t("nagrania")} value="—" />
          <AdminStat label={t("eksporty")} value="—" />
        </div>

        <div className="grid gap-10 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
          <section>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <SectionLabel>{t("bityPlatformy")}</SectionLabel>
              <Link
                href="/admin/beats"
                className="text-sm text-[var(--brd-green)] hover:underline"
              >
                {t("pelnaLista")}
              </Link>
            </div>
            {beats.length === 0 ? (
              <p className="border border-[var(--brd-line)] px-4 py-8 text-sm text-[var(--brd-mute)]">
                {t("brakBitowPlatformy")}
              </p>
            ) : (
              <div className="overflow-x-auto border border-[var(--brd-line)]">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="border-b border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/50">
                    <tr className="brd-meta text-[10px] uppercase tracking-[0.12em] text-[var(--brd-mute)]">
                      <th className="px-3 py-3 font-medium">{t("tytul")}</th>
                      <th className="px-3 py-3 font-medium">{t("status")}</th>
                      <th className="px-3 py-3 font-medium">{t("audio")}</th>
                      <th className="px-3 py-3 font-medium">{t("bpm")}</th>
                      <th className="px-3 py-3 font-medium">{t("czas")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--brd-line)]">
                    {beats.slice(0, 8).map((beat) => (
                      <tr
                        key={beat.id}
                        className="hover:bg-[var(--brd-paper-deep)]/40"
                      >
                        <td className="px-3 py-3">
                          <Link
                            href={`/admin/beats/${beat.id}`}
                            className="font-medium hover:text-[var(--brd-green)]"
                          >
                            {tl(beat.title)}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill tone="neutral">
                            {tl(labelBeatStatus(beat.status))}
                          </StatusPill>
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill
                            tone={beat.activeMasterReady ? "ok" : "warn"}
                          >
                            {tl(labelAudioReady(beat.activeMasterReady))}
                          </StatusPill>
                        </td>
                        <td className="brd-meta px-3 py-3 text-xs text-[var(--brd-mute)]">
                          {beat.bpm}
                        </td>
                        <td className="brd-meta px-3 py-3 text-xs text-[var(--brd-mute)]">
                          {tl(formatDurationSeconds(beat.durationSeconds))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-8">
            <div>
              <SectionLabel className="mb-4">{t("sekcje")}</SectionLabel>
              <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
                <AdminLink
                  href="/admin/beats"
                  title={t("bity")}
                  meta={t("tworzenieMetadataPublikacja")}
                />
                <AdminLink
                  href="/admin/moderation"
                  title={t("moderacja")}
                  meta={t("kolejkaSpolecznosci")}
                />
                <AdminLink
                  href="/admin/users"
                  title={t("uzytkownicy")}
                  meta={t("listaWyszukiwanieFiltry")}
                />
                <AdminLink
                  href="/admin/sample-policy"
                  title={t("politykaNagran")}
                  meta={t("limityDlugosciNagraniaBronze")}
                />
                <AdminLink
                  href="/admin"
                  title={t("nagrania")}
                  meta={t("wkrotce2")}
                  soon
                />
                <AdminLink
                  href="/admin"
                  title={t("eksporty")}
                  meta={t("wkrotce2")}
                  soon
                />
                <AdminLink
                  href="/admin"
                  title={t("ustawienia")}
                  meta={t("wkrotce2")}
                  soon
                />
              </ul>
            </div>

            <div>
              <SectionLabel className="mb-4">{t("ostatniaAktywnosc")}</SectionLabel>
              <ul className="space-y-3 text-sm text-[var(--brd-ink-soft)]">
                <li className="border-l-2 border-[var(--brd-green)] pl-3">
                  {t("panelBitowIModeracja")}
                </li>
                <li className="border-l-2 border-[var(--brd-line)] pl-3">
                  {t("pelnyPodgladNagranI")}
                </li>
              </ul>
            </div>
          </section>
        </div>
      </PageFrame>
    </main>
  );
}

function AdminStat({ label, value }: { label: string; value: string }) {
  const tl = useLibText();
  return (
    <div className="bg-[var(--brd-paper)] px-4 py-4">
      <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
        {tl(label)}
      </p>
      <p className="mt-2 text-2xl text-[var(--brd-ink)]">{tl(value)}</p>
    </div>
  );
}

function AdminLink({
  href,
  title,
  meta,
  soon,
}: {
  href: string;
  title: string;
  meta: string;
  soon?: boolean;
}) {
  const tl = useLibText();
  const t = useTranslations("admin.adminPage");
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-11 items-center justify-between gap-3 py-3 hover:bg-[var(--brd-paper-deep)]/40"
      >
        <div className="min-w-0">
          <p className="font-medium">{tl(title)}</p>
          <p className="text-sm text-[var(--brd-mute)]">{tl(meta)}</p>
        </div>
        <StatusPill tone={soon ? "neutral" : "ok"}>
          {tl(soon ? t("wkrotce") : t("dostepne"))}
        </StatusPill>
      </Link>
    </li>
  );
}
