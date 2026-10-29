import { getLibText } from "@/i18n/get-lib-text";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { checkAccess } from "@/lib/auth/access-denial";
import { formatDurationSeconds } from "@/lib/beats/public";
import {
  listPlatformBeatsForAdmin,
  requireAdminPlatformBeatsAccess,
} from "@/lib/beats/service";
import { labelBeatStatus } from "@/lib/ui/labels";
import { cn } from "@/lib/utils";

export default async function AdminBeatsListPage() {
  const tl = await getLibText();
  const t = await getTranslations("admin.adminBeatsPage");
  // The layout gate does not stop this page from rendering, and its role check
  // is narrower than this guard (no `beats.edit`), so handle the denial here.
  const denial = await checkAccess(requireAdminPlatformBeatsAccess);
  if (denial === "UNAUTHENTICATED") redirect("/sign-in");
  if (denial === "FORBIDDEN") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">{t("brakDostepu")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("brakUprawnieniaDoEdycji")}
        </p>
      </main>
    );
  }

  const beats = await listPlatformBeatsForAdmin();

  return (
    <main className="mx-auto flex w-full max-w-[var(--brd-max-ops)] flex-col gap-8 px-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--brd-line)] pb-6">
        <div className="space-y-2">
          <p className="brd-meta text-[11px] uppercase tracking-[0.2em] text-[var(--brd-mute)]">
            {t("panelAdministracyjny")}
          </p>
          <h1 className="brd-display text-3xl font-semibold tracking-tight">
            {t("bity")}
          </h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
            {t("tworzUzupelniajDaneWgrywaj")}
          </p>
        </div>
        <Link href="/admin/beats/new" className={cn(buttonVariants())}>
          {t("nowyBit")}
        </Link>
      </header>

      {beats.length === 0 ? (
        <p className="text-sm text-[var(--brd-mute)]">{t("brakBitowPlatformy")}</p>
      ) : (
        <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
          {beats.map((beat) => (
            <li key={beat.id}>
              <Link
                href={`/admin/beats/${beat.id}`}
                className="flex flex-col gap-2 py-4 outline-none transition-colors hover:bg-[var(--brd-paper-deep)]/40 focus-visible:bg-[var(--brd-paper-deep)]/40 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium tracking-tight">
                    {tl(beat.title)}
                  </p>
                  <p className="text-xs text-[var(--brd-mute)]">
                    {tl(labelBeatStatus(beat.status))} {t("audio")}{" "}
                    {tl(beat.activeMasterReady ? "gotowe" : "brak")}
                  </p>
                </div>
                <dl className="flex flex-wrap gap-x-4 text-xs text-[var(--brd-mute)] tabular-nums">
                  <div>
                    <dt className="sr-only">{t("bpm")}</dt>
                    <dd>{beat.bpm} {t("bpm")}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">{t("czas")}</dt>
                    <dd>{tl(formatDurationSeconds(beat.durationSeconds))}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
