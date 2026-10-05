import Link from "next/link";
import { redirect } from "next/navigation";

import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { UserBeatActions } from "@/components/beats/user-beat-actions";
import { BeatGrantsPanel } from "@/components/grants/beat-grants-panel";
import { AppShell } from "@/components/site/app-shell";
import { AuthError, requireUser } from "@/lib/auth/session";
import { listOwnUserBeats } from "@/lib/beats/service";
import { beatStatusLabelPl } from "@/lib/beats/status-labels";
import { listOwnerBeatAccessGrantsFor } from "@/lib/grants/beat-access-grants";

export const metadata = {
  title: "Moje bity · BitRymDym",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default async function AccountBeatsPage() {
  let context;
  try {
    context = await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    redirect("/account");
  }

  const beats = await listOwnUserBeats();
  const grantsByBeatId = new Map<
    string,
    Awaited<ReturnType<typeof listOwnerBeatAccessGrantsFor>>
  >();
  for (const beat of beats) {
    if (beat.status !== "PUBLISHED") continue;
    grantsByBeatId.set(
      beat.id,
      await listOwnerBeatAccessGrantsFor(context, beat.id),
    );
  }

  return (
    <AppShell tone="studio">
      <main className="pb-16">
        <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--brd-line)] pb-6">
            <div className="space-y-2">
              <SectionLabel>Studio</SectionLabel>
              <h1 className="brd-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Moje bity
              </h1>
              <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
                Wersje robocze, moderacja i decyzje — bez publicznej publikacji
                z tego panelu.
              </p>
            </div>
            <BrdLink href="/beats/upload">Dodaj bit</BrdLink>
          </header>

          {beats.length === 0 ? (
            <p className="text-sm text-[var(--brd-mute)]">
              Nie masz jeszcze bitów.{" "}
              <Link
                href="/beats/upload"
                className="text-[var(--brd-green)] underline underline-offset-4"
              >
                Dodaj pierwszy
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
              {beats.map((beat) => (
                <li
                  key={beat.id}
                  className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium tracking-tight text-[var(--brd-ink)]">
                      {beat.title}
                    </p>
                    <p className="text-sm text-[var(--brd-mute)]">
                      {beatStatusLabelPl(beat.status)}
                      {beat.producer ? ` · ${beat.producer}` : ""}
                      {" · "}
                      {formatDuration(beat.durationSeconds)}
                      {" · "}
                      {beat.bpm} BPM
                      {beat.activeMasterReady ? " · audio gotowe" : ""}
                    </p>
                    {beat.status === "REJECTED" && beat.rejectionReason ? (
                      <p className="text-sm text-[var(--brd-ink-soft)]">
                        <span className="text-[var(--brd-mute)]">
                          Powód odrzucenia:{" "}
                        </span>
                        {beat.rejectionReason}
                      </p>
                    ) : null}
                    {beat.status === "APPROVED" ? (
                      <p className="text-xs text-[var(--brd-mute)]">
                        Zatwierdzone — oczekuje na publikację przez zespół.
                      </p>
                    ) : null}
                    {beat.status === "PUBLISHED" ? (
                      <p className="text-xs text-[var(--brd-mute)]">
                        Widoczny w publicznym katalogu.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex w-full min-w-0 flex-col gap-3 sm:max-w-sm">
                    <UserBeatActions
                      beatId={beat.id}
                      status={beat.status}
                      activeMasterReady={beat.activeMasterReady}
                    />
                    {beat.status === "PUBLISHED" ? (
                      <BeatGrantsPanel
                        beatId={beat.id}
                        initialGrants={grantsByBeatId.get(beat.id) ?? []}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/account"
            className="text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
          >
            ← Wróć do studia
          </Link>
        </PageFrame>
      </main>
    </AppShell>
  );
}
