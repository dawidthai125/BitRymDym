"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  LYRICS_LIMITS,
  emptyLyricsDoc,
  lyricsCharCount,
  lyricsFocus,
  lyricsFromText,
  lyricsToText,
  readLyricsDoc,
  setLyricsSectionStart,
  type LyricsDoc,
  type LyricsRecMode,
} from "@/lib/studio/lyrics/lyrics";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";

type SaveStatus = "idle" | "saving" | "saved" | "local" | "error" | "conflict" | "tooLong";

const SAVE_DEBOUNCE_MS = 800;
const FONT_STEPS = ["text-base", "text-lg", "text-xl", "text-2xl"] as const;

function localKey(projectId: string) {
  return `brd:lyrics:${projectId}`;
}

function readLocal(projectId: string): LyricsDoc | null {
  try {
    const raw = window.localStorage.getItem(localKey(projectId));
    return raw ? readLyricsDoc(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(projectId: string, doc: LyricsDoc) {
  try {
    window.localStorage.setItem(localKey(projectId), JSON.stringify(doc));
  } catch {
    /* storage full / private mode — server copy is the source of truth */
  }
}

type LoadedLyrics = { available: boolean; doc: LyricsDoc; version: number; fromDevice: boolean };

async function fetchLyrics(projectId: string): Promise<LoadedLyrics> {
  try {
    const res = await fetch(`/api/studio/projects/${projectId}/lyrics`, { cache: "no-store" });
    const json = (await res.json()) as { available?: boolean; lyrics?: { doc?: unknown; version?: number } | null };
    if (!res.ok || json.available === false) throw new Error("unavailable");
    const version = typeof json.lyrics?.version === "number" ? json.lyrics.version : 0;
    // Nothing on the server yet but a device copy exists (e.g. typed while offline) → keep it and upload.
    const local = version === 0 ? readLocal(projectId) : null;
    if (local && local.sections.length) return { available: true, doc: local, version, fromDevice: true };
    return { available: true, doc: readLyricsDoc(json.lyrics?.doc), version, fromDevice: false };
  } catch {
    return { available: false, doc: readLocal(projectId) ?? emptyLyricsDoc(), version: 0, fromDevice: true };
  }
}

/** Project lyrics: server copy with CAS (version), device copy as a fallback. */
function useProjectLyrics(projectId: string) {
  const [doc, setDoc] = useState<LyricsDoc>(emptyLyricsDoc);
  const [saveState, setSaveState] = useState<SaveStatus>("idle");
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const versionRef = useRef(0);
  const dirtyRef = useRef(false);
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const adopt = useCallback((r: LoadedLyrics) => {
    versionRef.current = r.version;
    dirtyRef.current = r.available && r.fromDevice;
    setAvailable(r.available);
    setDoc(r.doc);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchLyrics(projectId).then((r) => {
      if (!cancelled) adopt(r);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, adopt]);

  useEffect(() => {
    if (!loaded || !dirtyRef.current) return;
    if (lyricsCharCount(doc) > LYRICS_LIMITS.maxTotalChars) return;
    writeLocal(projectId, doc);
    if (!available) return;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/studio/projects/${projectId}/lyrics`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: versionRef.current, doc: docRef.current }),
        });
        if (res.status === 409) {
          adopt({ ...(await fetchLyrics(projectId)), fromDevice: false });
          setSaveState("conflict");
          return;
        }
        const json = (await res.json().catch(() => ({}))) as { lyrics?: { version?: number } };
        if (!res.ok || typeof json.lyrics?.version !== "number") throw new Error("save");
        versionRef.current = json.lyrics.version;
        dirtyRef.current = false;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [doc, loaded, available, adopt, projectId]);

  const update = useCallback((next: LyricsDoc) => {
    dirtyRef.current = true;
    setDoc(next);
  }, []);

  const status: SaveStatus =
    lyricsCharCount(doc) > LYRICS_LIMITS.maxTotalChars ? "tooLong" : !available && loaded ? "local" : saveState;
  return { doc, update, status, loaded };
}

/**
 * Lyrics on screen while recording: editor + teleprompter that follows the
 * playhead, or holds the loop section during loop / punch-in takes.
 */
export function StudioLyricsCard({
  projectId,
  getPlayheadMs,
  mode,
  loopStartMs,
  punchLine,
}: {
  projectId: string;
  getPlayheadMs: () => number;
  mode: LyricsRecMode;
  /** Section loop start (loop / punch modes). */
  loopStartMs: number | null;
  /** Punch line index inside the loop section (bar-line heuristic). */
  punchLine: number | null;
}) {
  const t = useTranslations("studio.lyrics");
  const editorId = useId();
  const { doc, update, status, loaded } = useProjectLyrics(projectId);
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [font, setFont] = useState(1);
  const [focus, setFocus] = useState<{ sectionId: string | null; lineIndex: number | null }>({
    sectionId: null,
    lineIndex: null,
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Follow the playhead (cheap poll; only re-render when the highlighted spot changes).
  useEffect(() => {
    if (!open || editing) return;
    const tick = () => {
      const f = lyricsFocus({ doc, mode, playheadMs: getPlayheadMs(), loopStartMs, punchLine });
      setFocus((prev) =>
        prev.sectionId === f.sectionId && prev.lineIndex === f.lineIndex
          ? prev
          : { sectionId: f.sectionId, lineIndex: f.lineIndex },
      );
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [doc, mode, loopStartMs, punchLine, getPlayheadMs, open, editing]);

  useEffect(() => {
    const box = scrollRef.current;
    if (!box || !focus.sectionId) return;
    const el = box.querySelector<HTMLElement>(`[data-section-id="${focus.sectionId}"]`);
    if (el) box.scrollTo({ top: Math.max(0, el.offsetTop - box.offsetTop - 8), behavior: "smooth" });
  }, [focus.sectionId]);

  function startEditing() {
    setText(lyricsToText(doc));
    setEditing(true);
  }

  function onText(value: string) {
    setText(value);
    update(lyricsFromText(value, doc, { defaultLabel: t("domyslnaSekcja") }));
  }

  const chars = lyricsCharCount(doc);
  const anyAnchor = doc.sections.some((s) => s.startMs !== null);
  const statusText =
    status === "saving"
      ? t("zapisywanie")
      : status === "saved"
        ? t("zapisano")
        : status === "local"
          ? t("lokalnie")
          : status === "error"
            ? t("bladZapisu")
            : status === "conflict"
              ? t("konflikt")
              : status === "tooLong"
                ? t("zaDlugi", { max: LYRICS_LIMITS.maxTotalChars })
                : null;

  return (
    <section
      data-testid="studio-lyrics-card"
      aria-labelledby={`${editorId}-title`}
      className="space-y-2 rounded border border-[var(--brd-line)] p-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${editorId}-title`} className="text-xs font-medium text-[var(--brd-ink)]">
          {t("tytul")}
          {mode !== "single" && loopStartMs !== null ? (
            <span className="ml-2 rounded bg-[var(--brd-ink)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brd-paper)]">
              {mode === "loop" ? t("petla") : t("punch")}
            </span>
          ) : null}
        </h3>
        <div className="flex items-center gap-1">
          {open && !editing && doc.sections.length ? (
            <>
              <Button type="button" size="sm" variant="ghost" className="min-h-9 min-w-9" aria-label={t("mniejsze")} disabled={font === 0} onClick={() => setFont((f) => Math.max(0, f - 1))}>
                A−
              </Button>
              <Button type="button" size="sm" variant="ghost" className="min-h-9 min-w-9" aria-label={t("wieksze")} disabled={font === FONT_STEPS.length - 1} onClick={() => setFont((f) => Math.min(FONT_STEPS.length - 1, f + 1))}>
                A+
              </Button>
            </>
          ) : null}
          {open ? (
            <Button
              type="button"
              size="sm"
              variant={editing ? "default" : "outline"}
              className="min-h-9"
              data-testid="studio-lyrics-edit"
              disabled={!loaded}
              onClick={() => (editing ? setEditing(false) : startEditing())}
            >
              {editing ? t("gotowe") : t("edytuj")}
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" className="min-h-9" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? t("ukryj") : t("pokaz")}
          </Button>
        </div>
      </div>

      {open && editing ? (
        <div className="space-y-1">
          <p className="text-xs text-[var(--brd-mute)]">{t("opis")}</p>
          <label htmlFor={editorId} className="sr-only">
            {t("tytul")}
          </label>
          <textarea
            id={editorId}
            data-testid="studio-lyrics-textarea"
            value={text}
            onChange={(e) => onText(e.target.value)}
            placeholder={t("placeholder")}
            rows={10}
            className="w-full resize-y rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] p-2 font-mono text-sm text-[var(--brd-ink)]"
          />
          <p className={`text-right text-[11px] ${chars > LYRICS_LIMITS.maxTotalChars ? "text-red-600" : "text-[var(--brd-mute)]"}`}>
            {t("licznik", { n: chars, max: LYRICS_LIMITS.maxTotalChars })}
          </p>
        </div>
      ) : null}

      {open && !editing ? (
        doc.sections.length === 0 ? (
          <p className="text-xs text-[var(--brd-mute)]">{loaded ? t("pusto") : "…"}</p>
        ) : (
          <>
            {!anyAnchor ? <p className="text-xs text-[var(--brd-mute)]">{t("podpowiedz")}</p> : null}
            <div
              ref={scrollRef}
              data-testid="studio-lyrics-prompter"
              aria-live="off"
              className="max-h-72 space-y-3 overflow-y-auto rounded bg-[var(--brd-paper)] p-1"
            >
              {doc.sections.map((s) => {
                const active = focus.sectionId === s.id;
                return (
                  <div
                    key={s.id}
                    data-section-id={s.id}
                    data-active={active ? "true" : "false"}
                    aria-current={active ? "true" : undefined}
                    className={`rounded p-2 transition-colors ${active ? "bg-[var(--brd-ink)] text-[var(--brd-paper)]" : "text-[var(--brd-ink)] opacity-70"}`}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        {active ? `▶ ${t("teraz")} · ` : ""}
                        {s.label}
                      </span>
                      <span className="font-mono text-[11px] opacity-80">
                        {s.startMs !== null ? t("od", { time: formatStudioTimeMs(s.startMs) }) : t("bezStartu")}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 min-h-7 bg-[var(--brd-paper)] px-2 text-[11px] text-[var(--brd-ink)]"
                        data-testid="studio-lyrics-anchor"
                        aria-label={t("startTuAria", { label: s.label, time: formatStudioTimeMs(Math.max(0, Math.round(getPlayheadMs()))) })}
                        onClick={() => update(setLyricsSectionStart(doc, s.id, Math.max(0, Math.round(getPlayheadMs()))))}
                      >
                        {t("startTu")}
                      </Button>
                      {s.startMs !== null ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 min-h-7 px-2 text-[11px] text-inherit"
                          onClick={() => update(setLyricsSectionStart(doc, s.id, null))}
                        >
                          {t("usunStart")}
                        </Button>
                      ) : null}
                    </div>
                    <div className={`space-y-0.5 leading-snug ${FONT_STEPS[font]}`}>
                      {s.lines.map((line, i) => (
                        <p
                          key={i}
                          data-line-active={active && focus.lineIndex === i ? "true" : undefined}
                          className={active && focus.lineIndex === i ? "rounded bg-amber-300 px-1 font-semibold text-black" : ""}
                        >
                          {line || "\u00a0"}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )
      ) : null}

      {open && statusText ? (
        <p data-testid="studio-lyrics-status" className="text-[11px] text-[var(--brd-mute)]">
          {statusText}
        </p>
      ) : null}
    </section>
  );
}
