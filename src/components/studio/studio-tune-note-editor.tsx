"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { StudioMixControl } from "@/components/studio/studio-mix-control";
import { useOptionalStudioTransportControls } from "@/components/studio/studio-transport-provider";
import { Button } from "@/components/ui/button";
import type { StudioFxTuneParams, StudioTuneNoteEdit } from "@/lib/studio/studio-fx-chain";
import { midiLabel, snapMidiToScale, type DetectedNote } from "@/lib/studio/tune/note-detect";
import {
  decodeTrackClips,
  detectTrackNotes,
  renderTrackSlice,
  type DecodedTrackClip,
  type NoteEditorClip,
} from "@/lib/studio/tune/note-editor-client";
import { mergeNoteEdits, noteEditFor, type NoteEditDraft } from "@/lib/studio/tune/note-edits";

const ROW_PX = 14;
const PX_PER_SEC = 90;
const BLACK = new Set([1, 3, 6, 8, 10]);
const PREVIEW_PAD_MS = 500;

type Phase = "idle" | "loading" | "ready" | "empty" | "no-audio";

/**
 * Gold — piano-roll editor for BRD Tune manual notes. Locked view (upgrade
 * hint) for every other plan. Edits are stored on the tune effect (`notes`)
 * and applied by the offline/E3 render; the note preview runs the same core.
 */
export function StudioTuneNoteEditor({
  params,
  notes,
  clips,
  allowed,
  loaded,
  disabled,
  onApply,
}: {
  params: StudioFxTuneParams;
  notes: readonly StudioTuneNoteEdit[] | undefined;
  clips: readonly NoteEditorClip[];
  allowed: boolean;
  loaded: boolean;
  disabled?: boolean;
  onApply: (notes: StudioTuneNoteEdit[]) => Promise<boolean>;
}) {
  const t = useTranslations("studio.tuneNotes");
  const transport = useOptionalStudioTransportControls();
  const [phase, setPhase] = useState<Phase>("idle");
  const [detected, setDetected] = useState<DetectedNote[]>([]);
  const [drafts, setDrafts] = useState<Map<number, NoteEditDraft>>(new Map());
  const [selected, setSelected] = useState<number | null>(null);
  const [fine, setFine] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<"tuned" | "dry" | null>(null);
  const decodedRef = useRef<DecodedTrackClip[]>([]);
  const sourceRef = useRef<{ stop(): void } | null>(null);
  const dragRef = useRef<{ index: number; y0: number; midi0: number } | null>(null);

  const savedCount = notes?.length ?? 0;

  const analyze = useCallback(async () => {
    setPhase("loading");
    setMsg(null);
    const resolve = (clip: NoteEditorClip) =>
      transport ? transport.resolveClipSourceUrl(clip) : Promise.resolve(null);
    const decoded = await decodeTrackClips(clips, resolve);
    decodedRef.current = decoded;
    if (decoded.length === 0) {
      setPhase("no-audio");
      return;
    }
    const found = detectTrackNotes(decoded);
    setDetected(found);
    setDrafts(new Map(found.map((n, i) => [i, noteEditFor(n, notes)])));
    setSelected(found.length > 0 ? 0 : null);
    setPhase(found.length > 0 ? "ready" : "empty");
  }, [clips, notes, transport]);

  useEffect(() => () => sourceRef.current?.stop(), []);

  const range = useMemo(() => {
    if (detected.length === 0) return { lo: 48, hi: 72, startMs: 0, endMs: 1000 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const [i, n] of detected.entries()) {
      const target = drafts.get(i)?.targetMidi ?? n.midi;
      lo = Math.min(lo, n.midi, target);
      hi = Math.max(hi, n.midi, target);
    }
    return {
      lo: Math.floor(lo) - 3,
      hi: Math.ceil(hi) + 3,
      startMs: Math.max(0, detected[0]!.startMs - 400),
      endMs: detected[detected.length - 1]!.endMs + 400,
    };
  }, [detected, drafts]);

  const rows = range.hi - range.lo + 1;
  const width = Math.max(320, Math.round(((range.endMs - range.startMs) / 1000) * PX_PER_SEC));
  const height = rows * ROW_PX;
  const xOf = (ms: number) => ((ms - range.startMs) / 1000) * PX_PER_SEC;
  const yOf = (midi: number) => (range.hi - midi) * ROW_PX + ROW_PX / 2;

  const update = (index: number, patch: Partial<NoteEditDraft>) =>
    setDrafts((prev) => {
      const next = new Map(prev);
      const cur = next.get(index);
      if (!cur) return prev;
      const merged = { ...cur, ...patch };
      merged.targetMidi = Math.round(Math.max(24, Math.min(108, merged.targetMidi)) * 100) / 100;
      next.set(index, merged);
      return next;
    });

  const edited = useMemo(() => mergeNoteEdits(detected, drafts), [detected, drafts]);

  function stopPreview() {
    sourceRef.current?.stop();
    sourceRef.current = null;
    setPreviewing(null);
  }

  async function preview(kind: "tuned" | "dry") {
    if (selected == null) return;
    stopPreview();
    const ctx = transport?.getContextForAux() as unknown as AudioContext | null;
    const note = detected[selected];
    if (!ctx || !note || typeof ctx.createBuffer !== "function") return;
    setMsg(t("renderuje"));
    await new Promise((r) => setTimeout(r, 0));
    const startMs = Math.max(0, note.startMs - PREVIEW_PAD_MS);
    const endMs = note.endMs + PREVIEW_PAD_MS;
    const slice = renderTrackSlice(decodedRef.current, startMs, endMs, kind === "tuned" ? { params, notes: edited } : null);
    const buffer = ctx.createBuffer(2, slice.left.length, slice.sampleRate);
    buffer.getChannelData(0).set(slice.left);
    buffer.getChannelData(1).set(slice.right);
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (sourceRef.current === src) {
        sourceRef.current = null;
        setPreviewing(null);
      }
    };
    src.start();
    sourceRef.current = src;
    setPreviewing(kind);
    setMsg(null);
  }

  async function apply(next: StudioTuneNoteEdit[]) {
    const ok = await onApply(next);
    setMsg(ok ? t("zastosowano") : t("blad"));
  }

  if (!loaded) return null;

  if (!allowed) {
    return (
      <div data-testid="studio-tune-notes-lock" className="space-y-1.5 rounded border border-dashed border-[var(--brd-line)] px-2 py-2 text-xs text-[var(--brd-mute)]">
        <p className="font-semibold text-[var(--brd-ink)]">🔒 {t("tytul")}</p>
        <MiniRollTeaser />
        <p>{t("lock")}</p>
        <a href="/premium" className="inline-flex min-h-9 items-center font-semibold text-[var(--brd-ink)] underline underline-offset-4">
          {t("zobaczGold")}
        </a>
      </div>
    );
  }

  const sel = selected != null ? detected[selected] : null;
  const selDraft = selected != null ? drafts.get(selected) : undefined;

  return (
    <section data-testid="studio-tune-notes" aria-label={t("tytul")} className="space-y-2 rounded border border-[var(--brd-line)] px-2 py-2">
      <p className="text-xs font-semibold text-[var(--brd-ink)]">{t("tytul")}</p>
      <p className="text-[11px] text-[var(--brd-mute)]">{t("opis")}</p>
      {savedCount > 0 && phase === "idle" ? (
        <p className="text-[11px] text-[var(--brd-ink)]">{t("zapisane", { count: savedCount })}</p>
      ) : null}

      {phase === "idle" || phase === "no-audio" || phase === "empty" ? (
        <div className="space-y-1.5">
          <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={disabled || clips.length === 0} data-testid="studio-tune-notes-show" onClick={() => void analyze()}>
            {t("pokaz")}
          </Button>
          {phase === "no-audio" ? <p role="status" className="text-[11px] text-[var(--brd-mute)]">{t("brakAudio")}</p> : null}
          {phase === "empty" ? <p role="status" className="text-[11px] text-[var(--brd-mute)]">{t("brakNut")}</p> : null}
          {savedCount > 0 ? (
            <Button type="button" size="sm" variant="ghost" className="min-h-9" disabled={disabled} onClick={() => void apply([])}>
              {t("wyczysc")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {phase === "loading" ? <p role="status" className="text-[11px] text-[var(--brd-mute)]">{t("analiza")}</p> : null}

      {phase === "ready" ? (
        <>
          <p role="status" className="text-[11px] text-[var(--brd-ink)]">{t("wykryto", { count: detected.length })}</p>
          <div className="flex items-center gap-1.5 text-[11px]" role="group" aria-label={t("precyzja")}>
            <span className="text-[var(--brd-mute)]">{t("precyzja")}:</span>
            {([false, true] as const).map((f) => (
              <button
                key={String(f)}
                type="button"
                aria-pressed={fine === f}
                onClick={() => setFine(f)}
                className={`min-h-9 rounded border px-2 ${fine === f ? "border-[var(--brd-ink)] bg-[var(--brd-bg)] font-semibold" : "border-[var(--brd-line)]"}`}
              >
                {f ? t("precyzjaCenty") : t("precyzjaPolton")}
              </button>
            ))}
          </div>

          <div className="flex overflow-hidden rounded border border-[var(--brd-line)]" data-testid="studio-tune-notes-roll">
            <div className="shrink-0 border-r border-[var(--brd-line)] bg-[var(--brd-paper)]" style={{ height }} aria-hidden>
              {Array.from({ length: rows }, (_, r) => {
                const midi = range.hi - r;
                const pc = ((midi % 12) + 12) % 12;
                return (
                  <div key={midi} className={`flex w-9 items-center justify-end pr-1 font-mono text-[9px] ${BLACK.has(pc) ? "bg-[var(--brd-bg)] text-[var(--brd-mute)]" : "text-[var(--brd-ink)]"}`} style={{ height: ROW_PX }}>
                    {pc === 0 || pc === 5 || pc === 9 ? midiLabel(midi) : ""}
                  </div>
                );
              })}
            </div>
            <div className="relative min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
              <svg
                role="img"
                aria-label={t("rola")}
                width={width}
                height={height}
                className="block touch-pan-x select-none"
                onPointerMove={(e) => {
                  const d = dragRef.current;
                  if (!d) return;
                  const semis = (d.y0 - e.clientY) / ROW_PX;
                  const step = fine ? 0.05 : 1;
                  update(d.index, { targetMidi: d.midi0 + Math.round(semis / step) * step });
                }}
                onPointerUp={() => (dragRef.current = null)}
                onPointerCancel={() => (dragRef.current = null)}
              >
                {Array.from({ length: rows }, (_, r) => {
                  const pc = (((range.hi - r) % 12) + 12) % 12;
                  return BLACK.has(pc) ? <rect key={r} x={0} y={r * ROW_PX} width={width} height={ROW_PX} fill="var(--brd-bg)" /> : null;
                })}
                {detected.map((n, i) => {
                  const draft = drafts.get(i);
                  const target = draft?.targetMidi ?? n.midi;
                  const changed = Math.abs(target - n.midi) >= 0.01 || draft?.touched;
                  const x = xOf(n.startMs);
                  const w = Math.max(6, xOf(n.endMs) - x);
                  const step = n.curve.length > 1 ? w / (n.curve.length - 1) : 0;
                  const points = n.curve.map((m, k) => `${(x + k * step).toFixed(1)},${yOf(m).toFixed(1)}`).join(" ");
                  return (
                    <g key={i}>
                      <polyline points={points} fill="none" stroke="var(--brd-mute)" strokeWidth={1} opacity={0.7} />
                      <rect
                        data-testid="studio-tune-note"
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected === i}
                        aria-label={t("nutaAria", { name: midiLabel(target), sec: (n.startMs / 1000).toFixed(1) })}
                        x={x}
                        y={yOf(target) - ROW_PX / 2 + 1}
                        width={w}
                        height={ROW_PX - 2}
                        rx={3}
                        className="cursor-ns-resize"
                        style={{ touchAction: "none" }}
                        fill={changed ? "var(--brd-accent, #e4572e)" : "var(--brd-ink)"}
                        opacity={selected === i ? 1 : 0.75}
                        stroke={selected === i ? "var(--brd-ink)" : "none"}
                        strokeWidth={2}
                        onPointerDown={(e) => {
                          if (disabled) return;
                          (e.target as Element).setPointerCapture?.(e.pointerId);
                          setSelected(i);
                          dragRef.current = { index: i, y0: e.clientY, midi0: target };
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                            e.preventDefault();
                            const dir = e.key === "ArrowUp" ? 1 : -1;
                            update(i, { targetMidi: target + dir * (e.shiftKey || fine ? 0.1 : 1) });
                          }
                          if (e.key === "Enter" || e.key === " ") setSelected(i);
                        }}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {sel && selDraft && selected != null ? (
            <div className="space-y-2 rounded border border-[var(--brd-line)] px-2 py-2" data-testid="studio-tune-note-selected">
              <p className="text-xs font-semibold text-[var(--brd-ink)]">{t("nuta", { from: midiLabel(sel.midi), to: midiLabel(selDraft.targetMidi) })}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  ["polTonuWDol", -1],
                  ["centyWDol", -0.1],
                  ["centyWGore", 0.1],
                  ["polTonuWGore", 1],
                ] as const).map(([key, delta]) => (
                  <Button key={key} type="button" size="sm" variant="outline" className="min-h-11 px-1 text-xs" disabled={disabled} onClick={() => update(selected, { targetMidi: selDraft.targetMidi + delta, touched: true })}>
                    {t(key)}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={disabled} onClick={() => update(selected, { targetMidi: snapMidiToScale(sel.midi, params.keyRoot, params.scale), touched: true })}>
                  {t("doTonacji")}
                </Button>
                <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={disabled} onClick={() => update(selected, { targetMidi: sel.midi, amount: 1, retuneMs: 0, touched: false })}>
                  {t("oryginal")}
                </Button>
              </div>
              <StudioMixControl
                label={t("sila")}
                ariaLabel={t("sila")}
                value={selDraft.amount}
                display={`${Math.round(selDraft.amount * 100)}%`}
                min={0}
                max={1}
                step={0.05}
                disabled={disabled}
                onLocalChange={(v) => update(selected, { amount: v, touched: true })}
                onCommit={(v) => update(selected, { amount: v, touched: true })}
              />
              <StudioMixControl
                label={t("szybkosc")}
                ariaLabel={t("szybkosc")}
                value={selDraft.retuneMs}
                display={`${Math.round(selDraft.retuneMs)} ms`}
                min={0}
                max={400}
                step={5}
                disabled={disabled}
                onLocalChange={(v) => update(selected, { retuneMs: v, touched: true })}
                onCommit={(v) => update(selected, { retuneMs: v, touched: true })}
              />
              <div className="grid grid-cols-2 gap-1.5">
                {previewing ? (
                  <Button type="button" size="sm" variant="outline" className="col-span-2 min-h-11" onClick={stopPreview}>
                    {t("stop")}
                  </Button>
                ) : (
                  <>
                    <Button type="button" size="sm" className="min-h-11" data-testid="studio-tune-note-preview" disabled={!transport} onClick={() => void preview("tuned")}>
                      {t("odsluch")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={!transport} onClick={() => void preview("dry")}>
                      {t("odsluchOryginal")}
                    </Button>
                  </>
                )}
              </div>
              <p className="text-[10px] text-[var(--brd-mute)]">{t("podgladInfo")}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" className="min-h-11" data-testid="studio-tune-notes-apply" disabled={disabled} onClick={() => void apply(edited)}>
              {t("zastosuj", { count: edited.length })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={disabled}
              onClick={() => setDrafts(new Map(detected.map((n, i) => [i, noteEditFor(n, notes)])))}
            >
              {t("cofnij")}
            </Button>
          </div>
        </>
      ) : null}
      {msg ? (
        <p role="status" className="text-[11px] text-[var(--brd-mute)]">
          {msg}
        </p>
      ) : null}
    </section>
  );
}

/** Static mini piano roll behind the Gold lock (no audio work for locked plans). */
function MiniRollTeaser() {
  const bars = [
    [4, 2, 30],
    [40, 4, 26],
    [72, 3, 34],
    [112, 6, 22],
    [140, 5, 40],
  ] as const;
  return (
    <svg aria-hidden width="100%" height="44" viewBox="0 0 190 44" preserveAspectRatio="none" className="opacity-50">
      {bars.map(([x, row, w]) => (
        <rect key={x} x={x} y={row * 6} width={w} height={6} rx={2} fill="var(--brd-ink)" />
      ))}
    </svg>
  );
}
