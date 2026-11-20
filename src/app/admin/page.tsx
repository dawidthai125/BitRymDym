import { useLibText } from "@/i18n/use-lib-text";
import { getLibText } from "@/i18n/get-lib-text";
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
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  let takeCount = "—";
  let exportCount = "—";
  const people = { total: "—", week: "—", paying: "—", review: "—", mastersMonth: "—", paidMonth: "—", revenueMonth: "—" };
  let newest: { id: string; name: string; number: number | null; createdAt: string | null }[] = [];
  if (showPlatform) {
    const admin = createSupabaseAdminClient();
    const head = { count: "exact" as const, head: true };
    const { weekAgo, monthStart } = dashboardWindows();
    const [takes, jobs, total, week, paying, review, masters, paid, latest] = await Promise.all([
      admin.from("takes").select("id", head).eq("is_stem", false).neq("status", "DELETED"),
      admin.from("studio_master_jobs").select("id", head),
      admin.from("profiles").select("id", head),
      admin.from("profiles").select("id", head).gte("created_at", weekAgo),
      admin.from("premium_entitlements").select("user_id", head).eq("active", true).neq("source", "manual_admin"),
      admin.from("beats").select("id", head).eq("status", "PENDING_REVIEW"),
      admin.from("studio_master_jobs").select("id", head).eq("kind", "master").gte("created_at", monthStart).not("status", "in", "(failed,cancelled)"),
      admin.from("payment_orders").select("amount_grosz").eq("status", "paid").gte("created_at", monthStart),
      admin.from("profiles").select("id, display_name, user_number, created_at").order("created_at", { ascending: false }).limit(6),
    ]);
    const n = (r: { count: number | null; error: unknown }) => (!r.error && r.count != null ? String(r.count) : "—");
    takeCount = n(takes);
    exportCount = n(jobs);
    people.total = n(total);
    people.week = n(week);
    people.paying = n(paying);
    people.review = n(review);
    people.mastersMonth = n(masters);
    if (!paid.error) {
      const rows = (paid.data ?? []) as { amount_grosz: number | null }[];
      people.paidMonth = String(rows.length);
      people.revenueMonth = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(
        rows.reduce((sum, row) => sum + Number(row.amount_grosz ?? 0), 0) / 100,
      );
    }
    newest = ((latest.data ?? []) as { id: string; display_name: string | null; user_number: number | null; created_at: string | null }[]).map((u) => ({
      id: u.id,
      name: u.display_name?.trim() || "—",
      number: u.user_number,
      createdAt: u.created_at,
    }));
  }

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
            <BrdLink href="/admin/beats/generate" variant="secondary">
              {t("generator")}
            </BrdLink>
            <BrdLink href="/admin/beats/waiting" variant="secondary">
              {t("oczekujace")}
            </BrdLink>
            <BrdLink href="/admin/moderation" variant="secondary">
              {t("moderacja")}
            </BrdLink>
          </div>
        </header>

        <div className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--brd-line)] bg-[var(--brd-line)] sm:grid-cols-4">
          <AdminStat label={t("uzytkownicy")} value={people.total} href="/admin/users" />
          <AdminStat label={t("nowi7dni")} value={people.week} href="/admin/users" />
          <AdminStat label={t("placacy")} value={people.paying} href="/admin/platnosci" />
          <AdminStat label={t("wplatyMiesiac")} value={`${people.paidMonth} · ${people.revenueMonth}`} href="/admin/platnosci" />
        </div>
        <div className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--brd-line)] bg-[var(--brd-line)] sm:grid-cols-4">
          <AdminStat label={t("doModeracji")} value={people.review} href="/admin/moderation" alert={people.review !== "—" && people.review !== "0"} />
          <AdminStat label={t("bity")} value={`${readyCount} / ${beats.length}`} href="/admin/beats" />
          <AdminStat label={t("nagrania")} value={takeCount} />
          <AdminStat label={t("masteryMiesiac")} value={`${people.mastersMonth} · ${exportCount}`} />
        </div>

        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)] [&>section]:min-w-0">
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
                    <tr className="brd-meta text-xs uppercase tracking-[0.12em] text-[var(--brd-mute)]">
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
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <SectionLabel>{t("nowiUzytkownicy")}</SectionLabel>
                <Link href="/admin/users" className="text-sm text-[var(--brd-amber)] hover:underline">
                  {t("wszyscy")}
                </Link>
              </div>
              {newest.length === 0 ? (
                <p className="text-sm text-[var(--brd-ink-soft)]">—</p>
              ) : (
                <ul className="divide-y divide-[var(--brd-line)] rounded-lg border border-[var(--brd-line)]">
                  {newest.map((u) => (
                    <li key={u.id}>
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 hover:bg-[var(--brd-paper-deep)]/40"
                      >
                        <span className="min-w-0 truncate font-medium">{tl(u.name)}</span>
                        <span className="shrink-0 font-mono text-xs text-[var(--brd-ink-soft)]">
                          #{u.number ?? "—"} · {u.createdAt ? new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeZone: "Europe/Warsaw" }).format(new Date(u.createdAt)) : "—"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </PageFrame>
    </main>
  );
}

function AdminStat({ label, value, href, alert }: { label: string; value: string; href?: string; alert?: boolean }) {
  const tl = useLibText();
  const body = (
    <>
      <p className="text-xs uppercase tracking-[0.08em] text-[var(--brd-ink-soft)]">{tl(label)}</p>
      <p className={`mt-2 font-mono text-2xl tabular-nums ${alert ? "text-[var(--brd-amber)]" : "text-[var(--brd-ink)]"}`}>{tl(value)}</p>
    </>
  );
  return href ? (
    <Link href={href} className="block bg-[var(--brd-paper)] px-4 py-4 transition-colors hover:bg-[var(--brd-paper-deep)]">
      {body}
    </Link>
  ) : (
    <div className="bg-[var(--brd-paper)] px-4 py-4">{body}</div>
  );
}

/** Time windows for the dashboard counters (kept out of render for react-hooks/purity). */
function dashboardWindows(): { weekAgo: string; monthStart: string } {
  const now = new Date();
  return {
    weekAgo: new Date(now.getTime() - 7 * 864e5).toISOString(),
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
  };
}
