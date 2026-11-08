"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { AI_LYRICS_LIMITS, AI_LYRICS_STYLES, type AiLyricsMode, type AiLyricsStyle } from "@/lib/studio/lyrics/ai-lyrics";

type State =
  | { kind: "loading" }
  | { kind: "locked" }
  | { kind: "off" }
  | { kind: "ready"; used: number; perDay: number };

type Props = {
  projectId: string;
  /** Current lyrics as editable text — the starting point for "continue". */
  currentText: string;
  /** Put the generated text into the editor (append to the current text or replace it). */
  onInsert: (text: string, how: "append" | "replace") => void;
};

/** Silver+ AI lyrics: keywords, the start of a text or a piece of a verse → a draft the user can insert and edit. */
export function StudioAiLyricsPanel({ projectId, currentText, onInsert }: Props) {
  const t = useTranslations("studio.lyrics.ai");
  const id = useId();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [mode, setMode] = useState<AiLyricsMode>("keywords");
  const [style, setStyle] = useState<AiLyricsStyle | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/studio/projects/${projectId}/lyrics/generate`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { allowed?: boolean; available?: boolean; used?: number; perDay?: number }) => {
        if (cancelled) return;
        if (j.allowed === false) setState({ kind: "locked" });
        else if (j.available === false) setState({ kind: "off" });
        else if (typeof j.used === "number" && typeof j.perDay === "number") setState({ kind: "ready", used: j.used, perDay: j.perDay });
        else setState({ kind: "off" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "off" });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function pickMode(next: AiLyricsMode) {
    setMode(next);
    setError(null);
    // "continue" starts from the current text; "verse" and "keywords" from what the user types.
    if (next === "continue" && !input.trim()) setInput(currentText.slice(0, AI_LYRICS_LIMITS.maxChars.continue));
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setDraft(null);
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/lyrics/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, text: input, ...(style ? { style } : {}) }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        text?: string;
        used?: number;
        perDay?: number;
        error?: string;
        message?: string;
        available?: boolean;
      };
      if (res.ok && j.available === false) {
        setState({ kind: "off" });
      } else if (res.ok && typeof j.text === "string") {
        setDraft(j.text);
        if (typeof j.used === "number" && typeof j.perDay === "number") setState({ kind: "ready", used: j.used, perDay: j.perDay });
      } else if (j.error === "tier_lyrics") {
        setState({ kind: "locked" });
      } else if (j.error === "daily_limit") {
        setError(t("limitDzienny"));
      } else {
        setError(j.message && j.error === "bad_request" ? j.message : t("niedostepne"));
      }
    } catch {
      setError(t("niedostepne"));
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "loading") return null;

  if (state.kind === "locked") {
    return (
      <p data-testid="studio-ai-lyrics-locked" className="rounded border border-[var(--brd-line)] p-2 text-xs text-[var(--brd-mute)]">
        {t("odSilver")}{" "}
        <Link href="/premium" className="underline">
          {t("zobaczPlany")}
        </Link>
      </p>
    );
  }
  if (state.kind === "off") {
    return <p className="rounded border border-[var(--brd-line)] p-2 text-xs text-[var(--brd-mute)]">{t("niedostepne")}</p>;
  }

  const max = AI_LYRICS_LIMITS.maxChars[mode];
  const left = state.perDay - state.used;
  return (
    <section data-testid="studio-ai-lyrics" aria-labelledby={`${id}-t`} className="space-y-2 rounded border border-[var(--brd-line)] p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={`${id}-t`} className="text-xs font-medium">
          {t("tytul")}
        </h4>
        <span className="text-[11px] text-[var(--brd-mute)]">{t("licznik", { used: state.used, max: state.perDay })}</span>
      </div>
      <div role="group" aria-label={t("tryb")} className="flex flex-wrap gap-1">
        {(["keywords", "continue", "verse"] as const).map((m) => (
          <Button key={m} type="button" size="sm" variant={mode === m ? "default" : "outline"} className="min-h-9" aria-pressed={mode === m} onClick={() => pickMode(m)}>
            {t(`tryby.${m}`)}
          </Button>
        ))}
      </div>
      <div role="group" aria-label={t("styl")} className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-[var(--brd-mute)]">{t("styl")}:</span>
        <Button type="button" size="sm" variant={style === null ? "default" : "outline"} className="h-8 min-h-8 px-2 text-[11px]" aria-pressed={style === null} onClick={() => setStyle(null)}>
          {t("stylBrak")}
        </Button>
        {AI_LYRICS_STYLES.map((s) => (
          <Button key={s} type="button" size="sm" variant={style === s ? "default" : "outline"} className="h-8 min-h-8 px-2 text-[11px]" aria-pressed={style === s} onClick={() => setStyle(s)}>
            {t(`style.${s}`)}
          </Button>
        ))}
      </div>
      <label htmlFor={`${id}-in`} className="block text-xs text-[var(--brd-mute)]">
        {t(`opis.${mode}`)}
      </label>
      <textarea
        id={`${id}-in`}
        data-testid="studio-ai-lyrics-input"
        value={input}
        onChange={(e) => setInput(e.target.value.slice(0, max))}
        rows={mode === "keywords" ? 2 : 5}
        placeholder={t(`placeholder.${mode}`)}
        className="w-full resize-y rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] p-2 text-sm text-[var(--brd-ink)]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          data-testid="studio-ai-lyrics-go"
          className="min-h-9"
          disabled={busy || input.trim().length < AI_LYRICS_LIMITS.minChars || left <= 0}
          onClick={() => void generate()}
        >
          {busy ? t("pisze") : t("napisz")}
        </Button>
        <span className="text-[11px] text-[var(--brd-mute)]">{t("znaki", { n: input.length, max })}</span>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      {draft ? (
        <div data-testid="studio-ai-lyrics-draft" className="space-y-2">
          <p className="text-xs font-medium">{t("szkic")}</p>
          <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded bg-[var(--brd-paper)] p-2 font-mono text-sm">{draft}</pre>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-9"
              onClick={() => {
                onInsert(draft, "append");
                setDraft(null);
              }}
            >
              {t("dopisz")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-9"
              onClick={() => {
                onInsert(draft, "replace");
                setDraft(null);
              }}
            >
              {t("zamien")}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={() => setDraft(null)}>
              {t("odrzuc")}
            </Button>
          </div>
          <p className="text-[11px] text-[var(--brd-mute)]">{t("uwaga")}</p>
        </div>
      ) : null}
    </section>
  );
}
