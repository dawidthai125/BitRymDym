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
            <SectionLabel>Panel Administracyjny</SectionLabel>
            <h1 className="brd-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Pulpit
            </h1>
            <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
              Zarządzaj bitami, moderacją i stanem platformy.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <BrdLink href="/admin/beats/new">Nowy bit</BrdLink>
            <BrdLink href="/admin/moderation" variant="secondary">
              Moderacja
            </BrdLink>
          </div>
        </header>

        <div className="mb-10 grid grid-cols-2 gap-px border border-[var(--brd-line)] bg-[var(--brd-line)] sm:grid-cols-4">
          <AdminStat label="Bity" value={String(beats.length)} />
          <AdminStat label="Gotowe audio" value={String(readyCount)} />
          <AdminStat label="Nagrania" value="—" />
          <AdminStat label="Eksporty" value="—" />
        </div>

        <div className="grid gap-10 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
          <section>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <SectionLabel>Bity platformy</SectionLabel>
              <Link
                href="/admin/beats"
                className="text-sm text-[var(--brd-green)] hover:underline"
              >
                Pełna lista →
              </Link>
            </div>
            {beats.length === 0 ? (
              <p className="border border-[var(--brd-line)] px-4 py-8 text-sm text-[var(--brd-mute)]">
                Brak bitów platformy.
              </p>
            ) : (
              <div className="overflow-x-auto border border-[var(--brd-line)]">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="border-b border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/50">
                    <tr className="brd-meta text-[10px] uppercase tracking-[0.12em] text-[var(--brd-mute)]">
                      <th className="px-3 py-3 font-medium">Tytuł</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Audio</th>
                      <th className="px-3 py-3 font-medium">BPM</th>
                      <th className="px-3 py-3 font-medium">Czas</th>
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
                            {beat.title}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill tone="neutral">
                            {labelBeatStatus(beat.status)}
                          </StatusPill>
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill
                            tone={beat.activeMasterReady ? "ok" : "warn"}
                          >
                            {labelAudioReady(beat.activeMasterReady)}
                          </StatusPill>
                        </td>
                        <td className="brd-meta px-3 py-3 text-xs text-[var(--brd-mute)]">
                          {beat.bpm}
                        </td>
                        <td className="brd-meta px-3 py-3 text-xs text-[var(--brd-mute)]">
                          {formatDurationSeconds(beat.durationSeconds)}
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
              <SectionLabel className="mb-4">Sekcje</SectionLabel>
              <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
                <AdminLink
                  href="/admin/beats"
                  title="Bity"
                  meta="Tworzenie, metadata, publikacja"
                />
                <AdminLink
                  href="/admin/moderation"
                  title="Moderacja"
                  meta="Kolejka społeczności"
                />
                <AdminLink
                  href="/admin/users"
                  title="Użytkownicy"
                  meta="Lista, wyszukiwanie, filtry"
                />
                <AdminLink
                  href="/admin/sample-policy"
                  title="Polityka nagrań"
                  meta="Limity długości nagrania Bronze / Silver / Gold"
                />
                <AdminLink
                  href="/admin"
                  title="Nagrania"
                  meta="Wkrótce"
                  soon
                />
                <AdminLink
                  href="/admin"
                  title="Eksporty"
                  meta="Wkrótce"
                  soon
                />
                <AdminLink
                  href="/admin"
                  title="Ustawienia"
                  meta="Wkrótce"
                  soon
                />
              </ul>
            </div>

            <div>
              <SectionLabel className="mb-4">Ostatnia aktywność</SectionLabel>
              <ul className="space-y-3 text-sm text-[var(--brd-ink-soft)]">
                <li className="border-l-2 border-[var(--brd-green)] pl-3">
                  Panel bitów i moderacja są dostępne.
                </li>
                <li className="border-l-2 border-[var(--brd-line)] pl-3">
                  Pełny podgląd nagrań i eksportów pojawi się w kolejnej wersji.
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
  return (
    <div className="bg-[var(--brd-paper)] px-4 py-4">
      <p className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
        {label}
      </p>
      <p className="mt-2 text-2xl text-[var(--brd-ink)]">{value}</p>
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
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-11 items-center justify-between gap-3 py-3 hover:bg-[var(--brd-paper-deep)]/40"
      >
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-[var(--brd-mute)]">{meta}</p>
        </div>
        <StatusPill tone={soon ? "neutral" : "ok"}>
          {soon ? "Wkrótce" : "Dostępne"}
        </StatusPill>
      </Link>
    </li>
  );
}
