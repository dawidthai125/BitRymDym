import { useLibText } from "@/i18n/use-lib-text";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StatusPill } from "@/components/brand/chrome";
import { AutoCheckBadge } from "@/components/beats/auto-check-card";
import { CoverReviewQueue, type CoverReviewItem } from "@/components/beats/cover-review-queue";
import { checkAccess } from "@/lib/auth/access-denial";
import { getCurrentProfile } from "@/lib/auth/session";
import { formatProfileWithUserNumber } from "@/lib/auth/types";
import { loadAdminProfileIdentities } from "@/lib/auth/user-number";
import { loadLatestAutoChecks, type AutoCheckRow } from "@/lib/beats/auto-check/records";
import { listPendingBeatCovers } from "@/lib/beats/cover/cover-service";
import {
  listApprovedForModeration,
  listAutoRejectedForModeration,
  listPendingReviewForModeration,
  requireModerationAccess,
} from "@/lib/beats/service";
import { beatStatusLabelPl, beatStatusTone } from "@/lib/beats/status-labels";
import { intlTag, resolveLocale } from "@/i18n/config";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("admin.adminModerationPage");
  return {
  title: t("metaTitle"),
};
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ownerLabel(
  ownerId: string | null,
  identities: Map<string, { displayName: string | null; userNumber: number | null }>,
  isAdmin: boolean,
): string {
  if (!ownerId) return "—";
  if (!isAdmin) {
    return `${ownerId.slice(0, 8)}…`;
  }
  const identity = identities.get(ownerId);
  if (!identity) {
    return `${ownerId.slice(0, 8)}…`;
  }
  return formatProfileWithUserNumber(identity.displayName, identity.userNumber);
}

function QueueSection({
  title,
  empty,
  items,
  actionLabel,
  identities,
  isAdmin,
  checks,
}: {
  title: string;
  empty: string;
  items: Awaited<ReturnType<typeof listPendingReviewForModeration>>;
  actionLabel: string;
  identities: Map<string, { displayName: string | null; userNumber: number | null }>;
  isAdmin: boolean;
  checks: Map<string, AutoCheckRow>;
}) {
  const tl = useLibText();
  const t = useTranslations("admin.adminModerationPage");
  const tag = intlTag(resolveLocale(useLocale()));
  return (
    <section className="space-y-3" aria-labelledby={`queue-${title}`}>
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--brd-line)] pb-2">
        <h2 id={`queue-${title}`} className="text-lg font-medium tracking-tight">
          {tl(title)}
        </h2>
        <span className="brd-data text-sm text-[var(--brd-mute)]" aria-label={t("liczbaPozycji", { v0: items.length })}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tl(empty)}</p>
      ) : (
        <table className="brd-data-table w-full table-fixed text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-[34%]">{t("bit")}</th>
              <th scope="col" className="w-[18%]">{t("wlasciciel")}</th>
              <th scope="col" className="w-[7%] text-right">{t("czas")}</th>
              <th scope="col" className="w-[6%] text-right">{t("bpm")}</th>
              <th scope="col" className="w-[8%]">{t("audio")}</th>
              <th scope="col" className="w-[13%]">{t("zaktualizowano")}</th>
              <th scope="col"><span className="sr-only">{t("akcja")}</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((beat) => (
              <tr key={beat.id}>
                <td data-label={t("bit")}>
                  <span className="block font-medium tracking-tight text-[var(--brd-ink)]">
                    {tl(beat.title)}
                  </span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    <StatusPill tone={beatStatusTone(beat.status)}>
                      {tl(beatStatusLabelPl(beat.status))}
                    </StatusPill>
                    <AutoCheckBadge check={checks.get(beat.id)} />
                  </span>
                  {beat.producer ? (
                    <span className="mt-1 block text-xs text-muted-foreground">{tl(beat.producer)}</span>
                  ) : null}
                </td>
                <td data-label={t("wlasciciel")} className={isAdmin ? undefined : "brd-data text-xs"}>
                  {tl(ownerLabel(beat.ownerId, identities, isAdmin))}
                </td>
                <td data-label={t("czas")} className="brd-data text-right">
                  {tl(formatDuration(beat.durationSeconds))}
                </td>
                <td data-label={t("bpm")} className="brd-data text-right">
                  {beat.bpm}
                </td>
                <td data-label={t("audio")}>
                  {beat.activeMasterReady ? "gotowe" : (
                    <span className="text-[var(--brd-warn)]">{t("brak")}</span>
                  )}
                </td>
                <td data-label={t("zaktualizowano")} className="brd-data text-xs text-muted-foreground">
                  {tl(new Date(beat.updatedAt).toLocaleString(tag))}
                </td>
                <td className="text-right">
                  <Link
                    href={`/admin/moderation/${beat.id}`}
                    className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                  >
                    {tl(actionLabel)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function AdminModerationQueuePage() {
  const t = await getTranslations("admin.adminModerationPage");
  // The /admin layout renders the same denial (identical role set) but does not
  // stop this page from rendering, so the page must not throw it.
  const denial = await checkAccess(requireModerationAccess);
  if (denial === "UNAUTHENTICATED") redirect("/sign-in");
  if (denial === "FORBIDDEN") return null;

  const [pending, approved, autoRejected, context] = await Promise.all([
    listPendingReviewForModeration(),
    listApprovedForModeration(),
    listAutoRejectedForModeration(),
    getCurrentProfile(),
  ]);

  const isAdmin = context?.profile.role === "ADMIN";
  const coverItems: CoverReviewItem[] = context
    ? (await listPendingBeatCovers(context).catch((error: unknown) => {
        console.error("[admin/moderation] cover queue failed", error);
        return [];
      })).map((c) => {
        const m = c.moderation ?? {};
        const provider = typeof m.provider === "string" ? m.provider : "none";
        const top = typeof m.topCategory === "string" ? m.topCategory : null;
        const score = typeof m.maxScore === "number" ? m.maxScore : null;
        return {
          beatId: c.beatId,
          title: c.title,
          coverUpdatedAt: c.coverUpdatedAt,
          filterNote:
            provider === "gemini" || provider === "openai"
              ? `${t("filtrAi")}: ${top ?? "—"} ${score != null ? score.toFixed(2) : ""}`.trim()
              : null,
        };
      })
    : [];
  const checks = await loadLatestAutoChecks(
    [...pending, ...approved, ...autoRejected].map((b) => b.id),
  );
  const ownerIds = [...pending, ...approved, ...autoRejected]
    .map((b) => b.ownerId)
    .filter((id): id is string => Boolean(id));
  const identities = isAdmin
    ? await loadAdminProfileIdentities(ownerIds)
    : new Map();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 pb-16 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("moderacjaBitow")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("wModeracjiZatwierdzLub")}
        </p>
      </header>

      <QueueSection
        title={t("wModeracji")}
        empty={t("brakBitowOczekujacychNa")}
        items={pending}
        actionLabel={t("odtworzDecyzja")}
        identities={identities}
        isAdmin={Boolean(isAdmin)}
        checks={checks}
      />

      <QueueSection
        title={t("zatwierdzone")}
        empty={t("brakZatwierdzonychBitowDo")}
        items={approved}
        actionLabel={t("opublikuj")}
        identities={identities}
        isAdmin={Boolean(isAdmin)}
        checks={checks}
      />

      <CoverReviewQueue items={coverItems} />

      <QueueSection
        title={t("odrzuconePrzezFiltr")}
        empty={t("brakAutomatycznieOdrzuconychBitow")}
        items={autoRejected}
        actionLabel={t("szczegolyUchyl")}
        identities={identities}
        isAdmin={Boolean(isAdmin)}
        checks={checks}
      />
    </main>
  );
}
