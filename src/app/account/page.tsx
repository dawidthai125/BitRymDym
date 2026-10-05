import Link from "next/link";
import { redirect } from "next/navigation";

import { BrdButton, BrdLink } from "@/components/brand/brd-button";
import {
  PageFrame,
  SectionLabel,
  StatusPill,
} from "@/components/brand/chrome";
import { Waveform } from "@/components/brand/waveform";
import {
  ChangePasswordForm,
  DeleteAccountForm,
} from "@/components/auth/auth-forms";
import { DisplayNameForm } from "@/components/auth/display-name-form";
import { AppShell } from "@/components/site/app-shell";
import { signOutAction } from "@/lib/auth/actions";
import { canAccessAdminNav } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/session";
import { formatProfileWithUserNumber } from "@/lib/auth/types";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { listOwnTakes } from "@/lib/takes/list-own-takes";
import { formatDurationSeconds } from "@/lib/beats/public";
import {
  labelAccountLevel,
  labelRecordingMode,
  labelTakeStatus,
} from "@/lib/ui/labels";

/**
 * Artist Studio — action space, not a developer debug panel.
 */
export default async function AccountPage() {
  const env = getSupabasePublicEnv();
  if (!env.isConfigured) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6">
        <h1 className="brd-display text-2xl font-semibold">Studio</h1>
        <p className="text-sm text-[var(--brd-mute)]">
          Konfiguracja lokalna jest niekompletna. Uzupełnij środowisko i wróć.
        </p>
        <Link href="/" className="text-sm underline underline-offset-4">
          Strona główna
        </Link>
      </main>
    );
  }

  const context = await getCurrentProfile();
  if (!context) {
    redirect("/sign-in");
  }

  const showAdminNav = canAccessAdminNav(context.profile.role);
  let takes: Awaited<ReturnType<typeof listOwnTakes>> = [];
  try {
    takes = await listOwnTakes();
  } catch {
    takes = [];
  }
  const recentTakes = takes.slice(0, 5);
  const readyCount = takes.filter((t) => t.displayStatus === "READY").length;
  const displayName =
    context.profile.displayName?.trim() || "Twórca";
  const userNumberLabel =
    context.profile.userNumber != null
      ? String(context.profile.userNumber)
      : "—";

  return (
    <AppShell tone="studio">
      <main className="pb-16">
        <PageFrame className="py-10 sm:py-14">
          <header className="mb-10 grid gap-6 border-b border-[var(--brd-line)] pb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-3">
              <SectionLabel>Studio</SectionLabel>
              <h1 className="brd-display text-4xl font-semibold tracking-tight sm:text-5xl">
                Twoje studio
              </h1>
              <p className="max-w-prose text-sm text-[var(--brd-ink-soft)] sm:text-base">
                Nagrywaj, odsłuchuj i rozwijaj swoje numery.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BrdLink href="/beats">+ Nowe nagranie</BrdLink>
              <BrdLink href="/account/takes" variant="secondary">
                Moje nagrania
              </BrdLink>
            </div>
          </header>

          <div className="mb-10 flex flex-wrap gap-2">
            <StudioChip href="/account/takes" label="Moje nagrania" />
            <StudioChip href="/account/beats" label="Moje bity" />
            <StudioChip href="/account/downloads" label="Eksporty i pobrania" />
            <StudioChip href="/account/shared" label="Udostępnione" />
          </div>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.85fr)]">
            <section className="space-y-4">
              <div className="flex items-baseline justify-between gap-3">
                <SectionLabel>Ostatnie nagrania</SectionLabel>
                <Link
                  href="/account/takes"
                  className="text-sm text-[var(--brd-green)] hover:underline"
                >
                  Wszystkie →
                </Link>
              </div>

              {recentTakes.length === 0 ? (
                <div className="border border-[var(--brd-line)] px-5 py-10">
                  <p className="brd-display text-xl font-semibold">
                    Jeszcze cicho.
                  </p>
                  <p className="mt-2 text-sm text-[var(--brd-mute)]">
                    Wybierz bit i nagraj pierwsze nagranie.
                  </p>
                  <div className="mt-6">
                    <BrdLink href="/beats">Idź do katalogu</BrdLink>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
                  {recentTakes.map((take) => (
                    <li
                      key={take.id}
                      className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div className="min-w-0 space-y-2">
                        <p className="brd-display truncate text-lg font-semibold">
                          {take.beatTitle || "Bit"}
                        </p>
                        <p className="text-sm text-[var(--brd-mute)]">
                          {labelRecordingMode(take.recordingMode)}
                          {" · "}
                          {take.durationSeconds != null
                            ? formatDurationSeconds(take.durationSeconds)
                            : "—"}
                        </p>
                        <Waveform
                          seed={take.id}
                          progress={0.35}
                          bars={48}
                          heightClassName="h-7"
                        />
                      </div>
                      <StatusPill
                        tone={
                          take.displayStatus === "READY" ? "ok" : "neutral"
                        }
                      >
                        {labelTakeStatus(take.displayStatus)}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              )}

              <section className="pt-8">
                <SectionLabel className="mb-3">Twoja biblioteka</SectionLabel>
                <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
                  <LibraryRow
                    href="/account/takes"
                    title="Nagrania"
                    meta={`${readyCount} gotowych`}
                  />
                  <LibraryRow
                    href="/account/downloads"
                    title="Pobrane bity"
                    meta="Twoje pobrania"
                  />
                  <LibraryRow
                    href="/account/beats"
                    title="Moje bity"
                    meta="Wgrane i w moderacji"
                  />
                </ul>
              </section>
            </section>

            <aside className="space-y-8">
              <section
                id="profil"
                className="scroll-mt-24 space-y-4 border border-[var(--brd-line)] p-5"
              >
                <SectionLabel>Profil</SectionLabel>
                <div>
                  <p className="brd-display text-2xl font-semibold">
                    {formatProfileWithUserNumber(
                      displayName,
                      context.profile.userNumber,
                    )}
                  </p>
                  <p className="mt-1 text-sm text-[var(--brd-mute)]">
                    {labelAccountLevel(context.profile.accountLevel)}
                  </p>
                </div>

                <dl className="space-y-3 border-y border-[var(--brd-line)] py-4 text-sm">
                  <div>
                    <dt className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
                      Ksywka
                    </dt>
                    <dd className="mt-1 text-[var(--brd-ink)]">{displayName}</dd>
                  </div>
                  <div>
                    <dt className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
                      ID użytkownika
                    </dt>
                    <dd className="mt-1 text-[var(--brd-ink)]">{userNumberLabel}</dd>
                  </div>
                  <div>
                    <dt className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
                      E-mail
                    </dt>
                    <dd className="mt-1 break-all text-[var(--brd-ink)]">
                      {context.email ?? "—"}
                    </dd>
                  </div>
                </dl>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Stat label="Nagrania" value={String(takes.length)} />
                  <Stat label="Gotowe" value={String(readyCount)} />
                </dl>

                <DisplayNameForm
                  initialDisplayName={context.profile.displayName ?? ""}
                />

                <div>
                  <SectionLabel className="mb-2">Twój plan</SectionLabel>
                  <p className="text-sm text-[var(--brd-ink-soft)]">
                    Darmowy — odsłuch, nagrania i podstawowy miks. Premium
                    odblokuje wyższe jakości eksportu, gdy będzie dostępne.
                  </p>
                </div>

                {showAdminNav ? (
                  <Link
                    href="/admin"
                    className="inline-flex min-h-11 items-center text-sm text-[var(--brd-green)] underline-offset-4 hover:underline"
                  >
                    Panel Administracyjny →
                  </Link>
                ) : null}

                <form action={signOutAction}>
                  <BrdButton type="submit" variant="secondary" className="w-full">
                    Wyloguj
                  </BrdButton>
                </form>
              </section>

              <section
                id="security"
                className="scroll-mt-24 space-y-4 border border-[var(--brd-line)] p-5"
              >
                <SectionLabel>Bezpieczeństwo</SectionLabel>
                <ChangePasswordForm />
                <p className="text-sm text-[var(--brd-mute)]">
                  Nie pamiętasz hasła?{" "}
                  <Link
                    href="/forgot-password"
                    className="text-[var(--brd-green)] underline-offset-4 hover:underline"
                  >
                    Reset przez e-mail
                  </Link>
                </p>
              </section>

              <section
                id="danger"
                className="scroll-mt-24 space-y-4 border border-[var(--brd-line)] p-5"
              >
                <SectionLabel>Usuwanie konta</SectionLabel>
                <DeleteAccountForm />
              </section>
            </aside>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}

function StudioChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center border border-[var(--brd-line)] px-4 text-sm text-[var(--brd-ink)] hover:border-[var(--brd-green)] hover:text-[var(--brd-green)]"
    >
      {label}
    </Link>
  );
}

function LibraryRow({
  href,
  title,
  meta,
}: {
  href: string;
  title: string;
  meta: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-11 items-center justify-between gap-3 py-4 hover:text-[var(--brd-green)]"
      >
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-[var(--brd-mute)]">{meta}</p>
        </div>
        <span aria-hidden>→</span>
      </Link>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="brd-meta text-[10px] uppercase tracking-[0.14em] text-[var(--brd-mute)]">
        {label}
      </dt>
      <dd className="mt-1 text-lg text-[var(--brd-ink)]">{value}</dd>
    </div>
  );
}
