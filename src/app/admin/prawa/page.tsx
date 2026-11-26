import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { AuthError } from "@/lib/auth/session";
import { loadRightsDesk, type RightsDesk } from "@/lib/rights/content-reports";

import { HeldWorkControls, ReportControls } from "./rights-controls";

export const metadata = { title: "Prawa i zgłoszenia · Panel" };

const REASON: Record<string, string> = {
  copyright: "Cudzy utwór lub nagranie",
  stolen_beat: "Ukradziony bit",
  stolen_vocal: "Ukradziony wokal",
  other: "Inne naruszenie praw",
};
const KIND: Record<string, { label: string; href: (id: string) => string }> = {
  work: { label: "Utwór", href: (id) => `/utwor/${id}` },
  beat: { label: "Bit", href: (id) => `/beat/${id}` },
  sample: { label: "Sampel", href: (id) => `/sampel/${id}` },
};

const MATCH: Record<string, string> = {
  blocked_sha256: "kopia zdjętego pliku (identyczny plik)",
  blocked_fingerprint: "zdjęty plik (odcisk dźwięku)",
  catalog_sha256: "bit z katalogu (identyczny plik)",
  catalog_fingerprint: "bit z katalogu (odcisk dźwięku)",
};
const UPLOAD: Record<string, string> = { take: "nagranie / import wokalu", stem: "stem / Sam mastering", anon_take: "nagranie gościa", beat: "bit", sample: "sampel" };

const when = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" });

/**
 * Panel → Prawa i zgłoszenia (owner decision 2026-11-26). ADMIN only.
 * Catalogue works waiting for the rights check or held by it, and open infringement reports.
 */
export default async function AdminRightsPage() {
  let desk: RightsDesk;
  try {
    desk = await loadRightsDesk();
  } catch (error) {
    if (error instanceof AuthError) redirect(error.code === "UNAUTHENTICATED" ? "/sign-in?next=%2Fadmin%2Fprawa" : "/admin");
    throw error;
  }
  return (
    <main className="pb-16">
      <PageFrame width="ops" className="space-y-10 py-8 sm:py-10">
        <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
          <h1 className="brd-display text-3xl font-semibold tracking-tight">Prawa i zgłoszenia</h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
            Utwory przed wejściem do katalogu przechodzą sprawdzenie odcisków: gotowy utwór i każdy wgrany plik porównujemy z naszymi bitami i z bazą AcoustID.
            Trafienie albo błąd zatrzymuje utwór tutaj. Niżej zgłoszenia naruszeń od użytkowników i osób z zewnątrz.
          </p>
        </header>

        <section aria-labelledby="held-t" className="space-y-3">
          <h2 id="held-t" className="text-xl font-semibold">Utwory czekające ({desk.works.length})</h2>
          {desk.works.length === 0 ? <p className="text-sm text-[var(--brd-mute)]">Nic nie czeka.</p> : null}
          <ul className="space-y-3">
            {desk.works.map((w) => (
              <li key={w.id} className="grid gap-3 border border-[var(--brd-line)] p-4 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]" data-testid="admin-rights-work">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium break-words">{w.title}</p>
                  <p className="text-xs text-[var(--brd-mute)]">
                    {w.status === "held"
                      ? "Zatrzymany"
                      : w.stale
                        ? "Czeka ponad 30 min: sprawdź, czy działa program na serwerze"
                        : "Sprawdzanie w toku"}
                    {w.requestedAt ? ` · zgłoszony ${when.format(new Date(w.requestedAt))}` : ""}
                    {" · "}
                    <Link href={`/admin/users?q=${w.ownerId}`} className="underline">właściciel</Link>
                  </p>
                  {w.reasons.length ? (
                    <ul className="list-disc pl-5 text-xs">
                      {w.reasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  ) : w.summary ? <p className="text-xs">{w.summary}</p> : null}
                </div>
                <HeldWorkControls workId={w.id} />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="blk-t" className="space-y-3" data-testid="admin-rights-blocklist">
          <h2 id="blk-t" className="text-xl font-semibold">Lista blokad i odrzucone wgrania</h2>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
            Zdjęcie utworu, bitu albo sampla dopisuje jego pliki do listy blokad. Każde nowe wgranie porównujemy z nią: najpierw identyczny plik, potem odcisk dźwięku.
            Na liście: {desk.blocklist.blocked} plików{desk.blocklist.pending ? `, ${desk.blocklist.pending} czeka na odcisk` : ""}.
          </p>
          {desk.blocklist.staleScreens > 0 ? (
            <p role="alert" className="text-sm font-medium text-[var(--brd-rec)]">
              {desk.blocklist.staleScreens} nowych plików czeka na kontrolę dłużej niż 5 minut. Sprawdź program bitrymdym-upload-screen-worker-poll na serwerze: do kontroli ich projekty nie zrobią mastera.
            </p>
          ) : null}
          {desk.blocklist.events.length === 0 ? <p className="text-sm text-[var(--brd-mute)]">Nikt nie próbował wgrać zablokowanego pliku.</p> : (
            <ul className="space-y-1 text-xs">
              {desk.blocklist.events.map((e) => (
                <li key={e.id} className="border-b border-[var(--brd-line)] py-1">
                  {when.format(new Date(e.createdAt))} · {UPLOAD[e.uploadKind] ?? e.uploadKind} · {MATCH[e.matchKind] ?? e.matchKind}
                  {e.score != null ? ` · zgodność ${Math.round(e.score * 100)}%${e.matchedSeconds != null ? ` na ${Math.round(e.matchedSeconds)} s` : ""}` : ""}
                  {e.ownerId ? <> · <Link href={`/admin/users?q=${e.ownerId}`} className="underline">konto</Link></> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="rep-t" className="space-y-3">
          <h2 id="rep-t" className="text-xl font-semibold">Zgłoszenia naruszeń ({desk.reports.length})</h2>
          {desk.reports.length === 0 ? <p className="text-sm text-[var(--brd-mute)]">Brak otwartych zgłoszeń.</p> : null}
          <ul className="space-y-3">
            {desk.reports.map((r) => (
              <li key={r.id} className="grid gap-3 border border-[var(--brd-line)] p-4 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]" data-testid="admin-rights-report">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium break-words">
                    {KIND[r.kind]!.label}:{" "}
                    <Link href={KIND[r.kind]!.href(r.targetId)} className="underline underline-offset-4">{r.title || r.targetId}</Link>
                  </p>
                  <p className="text-xs text-[var(--brd-mute)]">
                    {REASON[r.reason] ?? r.reason} · {when.format(new Date(r.createdAt))} · {r.name ?? "?"}{r.email ? ` <${r.email}>` : ""}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-xs">{r.details}</p>
                </div>
                <ReportControls reportId={r.id} kind={r.kind} targetId={r.targetId} />
              </li>
            ))}
          </ul>
        </section>
      </PageFrame>
    </main>
  );
}
