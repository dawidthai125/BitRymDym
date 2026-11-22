"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("studio.recorderSession");
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
      setError(t("plikZaDuzy"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseRecorderSession(JSON.parse(String(reader.result)));
        if (!parsed || parsed.tracks.length === 0) {
          setSession(null);
          setError(t("toNieJestSesja"));
          return;
        }
        setSession(parsed);
        setError(null);
      } catch {
        setSession(null);
        setError(t("nieDaloSieOdczytac"));
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
        setError(json.code === "PROJECT_LIMIT_REACHED" ? t("limitProjektow") : (json.error ?? t("nieUdaloSieUtworzyc")));
        return;
      }
      setProjectId(json.document.project.id);
    } catch {
      setError(t("nieUdaloSieUtworzyc"));
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
      setError(t("nieDaloSieSkopiowac"));
    }
  }

  const span = session ? sessionSpanSeconds(session) : 1;
  const gold = tier === "GOLD";

  return (
    <section className="space-y-3 border border-[var(--brd-line)] bg-[var(--brd-paper-deep,#f3efe6)]/40 px-4 py-4 sm:px-5" data-testid="recorder-session-card">
      <div className="space-y-1">
        <h2 className="font-poster text-xl font-bold uppercase tracking-[0.06em] text-[var(--brd-ink)]">{t("naglowek")}</h2>
        <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
          {t("opis")}
        </p>
      </div>
      <label className="inline-flex min-h-11 cursor-pointer items-center border border-[var(--brd-ink-soft)] px-4 font-poster text-base font-bold uppercase tracking-[0.08em] text-[var(--brd-ink)] hover:bg-[var(--brd-paper)]">
        {t("wczytaj")}
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
            {t("podsumowanie", {
              title: session.title,
              beat: session.beatFileName || t("niepodany"),
              clock: clockText(session.beatSeconds),
              tracks: session.tracks.length,
              vocals: OFFLINE_VOCALS,
              extras: OFFLINE_EXTRAS,
              gold: SITE_GOLD_TRACKS,
            })}
          </p>
          <ol className="space-y-2">
            {session.tracks.map((track) => (
              <li key={`${track.order}-${track.stem}`} className="space-y-1">
                <p className="text-sm text-[var(--brd-ink)]">
                  {String(track.order).padStart(2, "0")}. {track.name}{" "}
                  <span className="text-[var(--brd-mute)]">
                    {track.role === "podbicie" ? t("rolaPodbicie") : t("rolaWokal")} · {track.gainDb >= 0 ? "+" : ""}
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
              ? t("wskazowkaGold")
              : t("wskazowkaInne")}
          </p>
          <div className="flex flex-wrap gap-3">
            <BrdButton type="button" variant="secondary" onClick={() => void copyList()}>
              {copied ? t("skopiowane") : t("kopiujSciage")}
            </BrdButton>
            <BrdButton type="button" variant="primary" disabled={pending} onClick={() => void createProject()}>
              {pending ? t("tworze") : t("utworzProjekt")}
            </BrdButton>
            {projectId ? (
              <BrdLink href={`/studio/p/${projectId}`} variant="secondary">
                {t("otworzSesje")}
              </BrdLink>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
