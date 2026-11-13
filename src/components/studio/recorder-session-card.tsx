"use client";

import { useState } from "react";

import { BrdButton, BrdLink } from "@/components/brand/brd-button";
import {
  OFFLINE_EXTRAS,
  OFFLINE_VOCALS,
  SITE_GOLD_TRACKS,
  clockText,
  panText,
  parseRecorderSession,
  sessionChecklist,
  sessionSpanSeconds,
  type RecorderSession,
} from "@/lib/studio/recorder-session";

type Props = {
  tier: string;
};

export function RecorderSessionCard({ tier }: Props) {
  const [session, setSession] = useState<RecorderSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function onFile(file: File | undefined) {
    setProjectId(null);
    setCopied(false);
    if (!file) return;
    if (file.size > 2_000_000) {
      setSession(null);
      setError("Plik sesji jest za duży. Wybierz sesja.brd.json, nie plik WAV.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseRecorderSession(JSON.parse(String(reader.result)));
        if (!parsed || parsed.tracks.length === 0) {
          setSession(null);
          setError("To nie jest sesja z programu (sesja.brd.json) albo nie ma w niej ścieżek.");
          return;
        }
        setSession(parsed);
        setError(null);
      } catch {
        setSession(null);
        setError("Nie dało się odczytać pliku.");
      }
    };
    reader.readAsText(file);
  }

  async function createProject() {
    if (!session) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: session.title, beatId: null }),
      });
      const json = (await res.json()) as {
        document?: { project: { id: string } };
        error?: string;
        code?: string;
      };
      if (!res.ok || !json.document?.project.id) {
        setError(json.code === "PROJECT_LIMIT_REACHED" ? "Masz już limit projektów w tym planie." : (json.error ?? "Nie udało się utworzyć projektu."));
        return;
      }
      setProjectId(json.document.project.id);
    } catch {
      setError("Nie udało się utworzyć projektu.");
    } finally {
      setPending(false);
    }
  }

  async function copyList() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(sessionChecklist(session).join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
      setError("Nie dało się skopiować ściągi.");
    }
  }

  const span = session ? sessionSpanSeconds(session) : 1;
  const gold = tier === "GOLD";

  return (
    <section className="space-y-3 border border-[var(--brd-line)] bg-[var(--brd-paper-deep,#f3efe6)]/40 px-4 py-4 sm:px-5" data-testid="recorder-session-card">
      <div className="space-y-1">
        <h2 className="font-poster text-xl font-bold uppercase tracking-[0.06em] text-[var(--brd-ink)]">Sesja z programu</h2>
        <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
          Studio Offline (Premium Gold) zapisuje u Ciebie stemy i plik sesja.brd.json. Tu widać kolejność ścieżek, miejsce na osi, głośność i balans lewo–prawo. Bit z pliku nie jedzie na stronę.
        </p>
      </div>
      <label className="inline-flex min-h-11 cursor-pointer items-center border border-[var(--brd-ink-soft)] px-4 font-poster text-base font-bold uppercase tracking-[0.08em] text-[var(--brd-ink)] hover:bg-[var(--brd-paper)]">
        Wczytaj sesja.brd.json
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => onFile(event.target.files?.[0])}
        />
      </label>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {session ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--brd-ink)]">
            {session.title}. Bit: {session.beatFileName || "niepodany"} ({clockText(session.beatSeconds)}). Ścieżek w sesji: {session.tracks.length}. W programie jest {OFFLINE_VOCALS} wokali i {OFFLINE_EXTRAS} podbić. Na stronie Gold mieści {SITE_GOLD_TRACKS} ścieżek nagrania, więc najpierw idą wokale.
          </p>
          <ol className="space-y-2">
            {session.tracks.map((track) => (
              <li key={`${track.order}-${track.stem}`} className="space-y-1">
                <p className="text-sm text-[var(--brd-ink)]">
                  {String(track.order).padStart(2, "0")}. {track.name}{" "}
                  <span className="text-[var(--brd-mute)]">
                    {track.role === "podbicie" ? "podbicie / adlib" : "wokal"} · {track.gainDb >= 0 ? "+" : ""}
                    {Math.round(track.gainDb)} dB · {panText(track.pan)} · {track.stem}
                  </span>
                </p>
                <div className="relative h-6 bg-[var(--brd-paper)]" aria-hidden="true">
                  {track.clips.map((clip) => (
                    <span
                      key={`${clip.start}-${clip.end}`}
                      className="absolute inset-y-1 bg-[var(--brd-amber)]"
                      style={{
                        left: `${(clip.start / span) * 100}%`,
                        width: `${Math.max(0.8, ((clip.end - clip.start) / span) * 100)}%`,
                      }}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <p className="max-w-prose text-sm text-[var(--brd-mute)]">{session.rightsNote}</p>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
            {gold
              ? "Utwórz projekt i otwórz sesję. Tam jest „Importuj stemy”: każdy plik kładzie się od początku osi. Stemy są nagrane od 0:00, więc siedzą tak jak przy nagrywaniu. Głośność i balans lewo–prawo ustaw według ściągi."
              : "Odczyt sesji jest dla każdego. Wrzucenie stemów w sesji studia jest w planie Gold."}
          </p>
          <div className="flex flex-wrap gap-3">
            <BrdButton type="button" variant="secondary" onClick={() => void copyList()}>
              {copied ? "Skopiowane" : "Kopiuj ściągę"}
            </BrdButton>
            <BrdButton type="button" variant="primary" disabled={pending} onClick={() => void createProject()}>
              {pending ? "Tworzę…" : "Utwórz projekt"}
            </BrdButton>
            {projectId ? (
              <BrdLink href={`/studio/p/${projectId}`} variant="secondary">
                Otwórz sesję studia
              </BrdLink>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
