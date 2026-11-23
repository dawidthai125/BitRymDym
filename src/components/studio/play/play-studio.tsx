"use client";

import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { PlayEngine, LoopPlayer } from "@/lib/studio/play/instrument-engine";
import { renderSessionWav } from "@/lib/studio/play/render-session";
import { CHORD_CODES, chordIndexForCode, codeLabel, isBlackKey, noteForCode, octaveShiftForCode, PAD_CODES, padForCode, shiftBaseNote } from "@/lib/studio/play/keyboard-map";
import { DEFAULT_CHORD_SET, findChord, strum } from "@/lib/studio/play/guitar-chords";
import { recordedNote, sampleInstrumentForPlay } from "@/lib/studio/play/sample-instrument";
import { SampekPanel } from "@/components/studio/play/sampek-panel";
import { isTypingTarget } from "@/components/studio/studio-play-keys";
import type { PlayInstrumentId, PlayLayer, PlaySession, SampekResult } from "@/lib/studio/play/play-types";
import { cn } from "@/lib/utils";

/** labelKey → studio.playStudio.instrumenty.* */
const INSTRUMENTS: { id: PlayInstrumentId; labelKey: string }[] = [
  { id: "piano", labelKey: "piano" }, { id: "epiano", labelKey: "epiano" }, { id: "guitar", labelKey: "guitar" },
  { id: "synth-lead", labelKey: "synthLead" }, { id: "synth-pad", labelKey: "synthPad" }, { id: "synth-bass", labelKey: "synthBass" },
  { id: "hiphop", labelKey: "hiphop" },
];
/** One octave and a bit, white and black keys in order (the same keys as on the computer keyboard). */
const PIANO_CODES = ["KeyA", "KeyW", "KeyS", "KeyE", "KeyD", "KeyF", "KeyT", "KeyG", "KeyY", "KeyH", "KeyU", "KeyJ", "KeyK", "KeyO", "KeyL"];
const PAD_LABELS = ["kick", "snare", "clap", "hat", "openhat", "rim", "808a", "808f"];
const isKit = (id: PlayInstrumentId) => id === "hiphop" || id === "drums";

export function PlayStudio({ bpm, beatId, canUseAi, onSaved }: { bpm: number; beatId?: string | null; canUseAi: boolean; /** The list of own samples below refreshes. */ onSaved?: () => void }) {
  const t = useTranslations("studio.playStudio");
  const instrumentLabel = (id: PlayInstrumentId) => {
    const labelKey = INSTRUMENTS.find((x) => x.id === id)?.labelKey;
    return labelKey ? t(`instrumenty.${labelKey}`) : id;
  };
  const [instrument, setInstrument] = useState<PlayInstrumentId>("piano");
  const [base, setBase] = useState(48);
  const [session, setSession] = useState<PlaySession>({ bpm, bars: 2, key: null, swing: 0, beatId, layers: [{ id: "layer-1", instrument: "piano", gain: 1, notes: [] }] });
  const sessionRef = useRef(session);
  const engine = useRef<PlayEngine | null>(null);
  const loop = useRef<LoopPlayer | null>(null);
  const held = useRef(new Map<string, { layerId: string; note: number; start: number; velocity: number }>());
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  /** Session before the last accepted Sampek change (one step back). */
  const [beforeSampek, setBeforeSampek] = useState<PlaySession | null>(null);
  const pressed = useRef(new Set<string>());
  const savingRef = useRef(false);
  const lastChord = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** The panel owns the computer keyboard only after it was used (not on the whole page). */
  const activeRef = useRef(false);
  const [rights, setRights] = useState(false);

  useEffect(() => { sessionRef.current = session; loop.current?.setSession(session); }, [session]);
  useEffect(() => () => { engine.current?.allOff(); loop.current?.stop(); }, []);
  // The bpm prop changed: adjust the session while rendering (no effect round-trip).
  const [sessionBpmProp, setSessionBpmProp] = useState(bpm);
  if (sessionBpmProp !== bpm) {
    setSessionBpmProp(bpm);
    setSession((s) => ({ ...s, bpm }));
  }

  /** State + ref together: a chord strikes six strings in one tick and must not create six layers. */
  function updateSession(change: (s: PlaySession) => PlaySession) {
    const next = change(sessionRef.current);
    sessionRef.current = next;
    setSession(next);
  }

  async function prepare(requestedInstrument: PlayInstrumentId = instrument) {
    const e = engine.current ?? new PlayEngine();
    engine.current = e;
    loop.current ??= new LoopPlayer(e);
    setLoading(true);
    try {
      await e.load(requestedInstrument);
      setStatus(t("instrumentGotowy"));
      return true;
    } catch {
      setStatus(t("nieUdaloSieWczytac"));
      return false;
    } finally {
      setLoading(false);
    }
  }

  /** Everything the session plays, loaded before the first beat. */
  async function prepareSession() {
    const ids = new Set<PlayInstrumentId>([instrument, ...sessionRef.current.layers.filter((l) => l.notes.length).map((l) => l.instrument)]);
    let ok = true;
    for (const id of ids) if (!engine.current?.loaded(id)) ok = (await prepare(id)) && ok;
    return ok;
  }

  function ensureLayer(id: PlayInstrumentId): PlayLayer {
    const existing = sessionRef.current.layers.find((l) => l.instrument === id);
    if (existing) return existing;
    const next = { id: `layer-${id}`, instrument: id, gain: 1, notes: [] } as PlayLayer;
    updateSession((s) => ({ ...s, layers: [...s.layers, next] }));
    return next;
  }

  function noteOn(key: string, note: number, velocity = 0.8) {
    pressed.current.add(key);
    const e = engine.current;
    if (!e?.loaded(instrument)) {
      // First touch turns the instrument on (no silent keys); the note sounds if it is still held.
      if (!loading) void prepare().then((ok) => { if (ok && pressed.current.has(key)) keyHandlers.current.noteOn(key, note, velocity); });
      return;
    }
    const layer = ensureLayer(instrument);
    e.noteOn(key, instrument, note, velocity, layer.synth, layer.gain);
    if (!recording || !loop.current?.running) return;
    held.current.set(key, { layerId: layer.id, note, start: Math.max(0, loop.current.beatsSinceStart()), velocity });
  }

  function noteOff(key: string) {
    pressed.current.delete(key);
    engine.current?.noteOff(key);
    const h = held.current.get(key); if (!h || !loop.current) return;
    held.current.delete(key);
    const { t: at, d } = recordedNote(h.start, loop.current.beatsSinceStart(), sessionRef.current.bars * 4);
    updateSession((s) => ({ ...s, layers: s.layers.map((l) => l.id === h.layerId ? { ...l, notes: [...l.notes, { t: at, d, n: h.note, v: h.velocity }].slice(-512) } : l) }));
  }

  function releaseAll() {
    for (const key of [...new Set([...pressed.current, ...held.current.keys()])]) noteOff(key);
    engine.current?.allOff();
  }

  function guitarAction(key: string, direction: "down" | "up") {
    const idx = chordIndexForCode(key); if (idx == null) return;
    const chord = findChord(DEFAULT_CHORD_SET[idx]!); if (!chord) return;
    lastChord.current = key;
    for (const hit of strum(chord, direction, direction === "down" ? 1.3 : 0.8)) noteOn(`g-${key}-${hit.string}`, hit.note, hit.velocity);
    window.setTimeout(() => strum(chord, direction, 1).forEach((hit) => keyHandlers.current.noteOff(`g-${key}-${hit.string}`)), 180);
  }

  // Latest note handlers for the window key listeners (they are fresh functions every render).
  const keyHandlers = useRef({ noteOn, noteOff, guitarAction, releaseAll });
  useLayoutEffect(() => {
    keyHandlers.current = { noteOn, noteOff, guitarAction, releaseAll };
  });
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      // Browser shortcuts (Ctrl+F, Ctrl+S…) and typing stay with the browser.
      if (!activeRef.current || ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey || isTypingTarget(ev.target)) return;
      const code = ev.code;
      if (instrument === "guitar") {
        if (code === "Space" && lastChord.current) { ev.preventDefault(); keyHandlers.current.guitarAction(lastChord.current, "down"); return; }
        if ((CHORD_CODES as readonly string[]).includes(code)) { keyHandlers.current.guitarAction(code, "down"); return; }
        return;
      }
      if (isKit(instrument)) {
        const pad = padForCode(code); if (pad == null) return;
        ev.preventDefault(); keyHandlers.current.noteOn(code, pad, ev.shiftKey ? 1 : 0.8);
        return;
      }
      const shift = octaveShiftForCode(code);
      if (shift) { setBase((b) => shiftBaseNote(b, shift)); return; }
      const n = noteForCode(code, base); if (n == null) return;
      ev.preventDefault(); keyHandlers.current.noteOn(code, n, ev.shiftKey ? 1 : 0.8);
    };
    // A key released in a text field or another window still ends its note.
    const up = (ev: KeyboardEvent) => { if (pressed.current.has(ev.code)) keyHandlers.current.noteOff(ev.code); };
    const blur = () => keyHandlers.current.releaseAll();
    const owner = (ev: Event) => { activeRef.current = Boolean(rootRef.current?.contains(ev.target as Node)); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    window.addEventListener("pointerdown", owner, true); window.addEventListener("focusin", owner);
    return () => {
      window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur);
      window.removeEventListener("pointerdown", owner, true); window.removeEventListener("focusin", owner);
    };
  }, [base, instrument]);

  async function toggleRecord() {
    if (recording) { releaseAll(); loop.current?.stop(); setRecording(false); setPlaying(false); return; }
    if (!(await prepareSession()) || !loop.current) return;
    loop.current.setSession(sessionRef.current); loop.current.setMetronome(true); loop.current.start(4); setRecording(true); setPlaying(true); setStatus(t("odliczanie"));
  }
  async function togglePlay() {
    if (playing) { releaseAll(); loop.current?.stop(); setPlaying(false); setRecording(false); return; }
    if (!(await prepareSession()) || !loop.current) return;
    loop.current.setSession(sessionRef.current); loop.current.setMetronome(false); loop.current.start(0); setPlaying(true);
  }
  async function preview(next: PlaySession | null) {
    if (!next) {
      loop.current?.stop(); loop.current?.setSession(sessionRef.current); setPlaying(false);
      return;
    }
    if (!(await prepareSession()) || !loop.current) return;
    for (const l of next.layers) if (l.notes.length && !engine.current?.loaded(l.instrument)) await prepare(l.instrument);
    loop.current.setSession(next); loop.current.setMetronome(false); loop.current.start(0); setPlaying(true);
  }
  function apply(result: SampekResult) {
    setBeforeSampek(sessionRef.current);
    updateSession(() => result.session);
    setStatus(result.changes.join(" "));
  }

  async function save() {
    if (savingRef.current || !rights || !session.layers.some((l) => l.notes.length)) return;
    savingRef.current = true;
    setSaving(true);
    setStatus(t("renderuje"));
    try {
      const rendered = await renderSessionWav(session, "loop");
      const form = new FormData(); form.set("file", new File([rendered.wav.buffer as ArrayBuffer], "graj-sample.wav", { type: "audio/wav" }));
      const played = session.layers.find((l) => l.instrument === instrument && l.notes.length) ?? session.layers.find((l) => l.notes.length)!;
      const saved = sampleInstrumentForPlay(played.instrument);
      form.set("title", (title.trim() || t("domyslnyTytul", { instrument: instrumentLabel(played.instrument) })).slice(0, 80));
      form.set("kind", saved.kind); form.set("instrument", saved.instrument); form.set("rightsAccepted", "1"); form.set("lab", "1"); form.set("sampleType", "loop"); form.set("source", "studio"); form.set("bpm", String(Math.round(session.bpm))); form.set("bars", String(session.bars));
      if (session.key) form.set("musicalKey", session.key); if (beatId) form.set("beatId", beatId);
      const response = await fetch("/api/studio/samples", { method: "POST", body: form });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { message?: string }).message ?? t("nieUdaloSieZapisac"));
      setStatus(t("zapisany")); setTitle("");
      onSaved?.();
    } catch (error) {
      setStatus(error instanceof Error && !(error instanceof TypeError) ? error.message : t("nieUdaloSieZapisac"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const keyProps = (key: string, note: number) => ({
    onPointerDown: () => noteOn(key, note),
    onPointerUp: () => noteOff(key),
    onPointerLeave: () => noteOff(key),
    onPointerCancel: () => noteOff(key),
  });
  const pianoKeys = PIANO_CODES.map((code) => ({ code, note: noteForCode(code, base) })).filter((k): k is { code: string; note: number } => k.note != null);
  return <div ref={rootRef} className="space-y-5 rounded-lg border border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/30 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{t("tytul")}</h2><p className="mt-1 text-sm text-[var(--brd-ink-soft)]">{t("opis")}</p></div><span className="rounded-full border border-[var(--brd-amber)] px-3 py-1 text-xs">{t("bpmTakty", { bpm: Math.round(session.bpm), bars: session.bars })}</span></div>
    <div className="flex flex-wrap items-end gap-3"><label className="min-w-44"><span className="mb-1 block text-xs uppercase text-[var(--brd-ink-soft)]">{t("instrument")}</span><select className="min-h-11 w-full rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3" value={instrument} onChange={(e) => { const id = e.target.value as PlayInstrumentId; setInstrument(id); void prepare(id); }}>{INSTRUMENTS.map((x) => <option key={x.id} value={x.id}>{instrumentLabel(x.id)}</option>)}</select></label><label><span className="mb-1 block text-xs uppercase text-[var(--brd-ink-soft)]">{t("takty")}</span><select className="min-h-11 rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3" value={session.bars} onChange={(e) => updateSession((s) => ({ ...s, bars: Number(e.target.value) }))}>{[1, 2, 4, 8].map((n) => <option key={n} value={n}>{n}</option>)}</select></label><button type="button" onClick={() => void prepare()} disabled={loading} className="min-h-11 rounded-md border border-[var(--brd-amber)] px-4 text-sm font-semibold">{loading ? t("wczytuje") : t("wlaczInstrument")}</button></div>
    <div className="rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4"><p className="mb-3 text-xs text-[var(--brd-ink-soft)]">{t("skroty")}</p>{instrument === "guitar" ? <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">{DEFAULT_CHORD_SET.map((chord, i) => <button key={chord} type="button" onPointerDown={() => guitarAction(CHORD_CODES[i]!, "down")} className="min-h-16 rounded-md border border-[var(--brd-line)] text-lg font-semibold hover:border-[var(--brd-amber)]">{chord}<span className="block text-xs text-[var(--brd-ink-soft)]">{i + 1}</span></button>)}</div> : isKit(instrument) ? <div className="grid grid-cols-4 gap-2">{PAD_LABELS.map((pad, i) => <button key={pad} type="button" {...keyProps(`mouse-pad-${i}`, i)} className="min-h-16 touch-none rounded-md border border-[var(--brd-line)] text-sm font-semibold hover:border-[var(--brd-amber)]">{t(`pady.${pad}`)}<span className="block text-xs text-[var(--brd-ink-soft)]">{codeLabel(PAD_CODES[i]!)}</span></button>)}</div> : <div className="flex items-start overflow-x-auto pb-2">{pianoKeys.map(({ code, note }) => <button key={code} type="button" {...keyProps(`mouse-${code}`, note)} className={cn("flex touch-none flex-col items-center justify-end border border-[var(--brd-line)] pb-2 text-sm font-semibold", isBlackKey(note) ? "h-20 min-w-9 bg-[var(--brd-ink)] text-[var(--brd-paper)] hover:opacity-80" : "h-28 min-w-12 bg-[var(--brd-paper)] hover:bg-[var(--brd-amber)]/20")}>{codeLabel(code)}</button>)}</div>}</div>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void toggleRecord()} disabled={loading} className="min-h-12 rounded-md bg-[var(--brd-rec)] px-5 font-semibold text-white">{recording ? t("zatrzymajNagrywanie") : t("nagrajPetle")}</button><button type="button" onClick={() => void togglePlay()} disabled={loading} className="min-h-12 rounded-md border border-[var(--brd-line)] px-5">{playing && !recording ? t("stop") : t("odtworz")}</button>{beforeSampek ? <button type="button" onClick={() => { updateSession(() => beforeSampek); setBeforeSampek(null); setStatus(t("cofnieto")); }} className="min-h-12 rounded-md border border-[var(--brd-amber)] px-4">{t("cofnijSampeka")}</button> : null}</div>
    {status ? <p role="status" className="text-sm text-[var(--brd-ink-soft)]">{status}</p> : null}
    {session.layers.some((l) => l.notes.length) ? <SampekPanel session={session} canUseAi={canUseAi} onPreview={(next) => void preview(next)} onApply={apply} /> : <p className="text-sm text-[var(--brd-ink-soft)]">{t("zagrajKilkaNut")}</p>}
    <div className="grid gap-3 border-t border-[var(--brd-line)] pt-4 md:grid-cols-[1fr_auto] md:items-end"><label><span className="mb-1 block text-xs uppercase text-[var(--brd-ink-soft)]">{t("nazwaSampla")}</span><input className="min-h-11 w-full rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("nazwaPlaceholder")} /></label><div><label className="mb-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1" /> {t("mamPrawa")}</label><button type="button" onClick={() => void save()} disabled={saving || !rights || !session.layers.some((l) => l.notes.length)} className="min-h-11 rounded-md bg-[var(--brd-amber)] px-5 font-semibold text-[var(--brd-on-media)] disabled:opacity-40">{saving ? t("zapisuje") : t("zapiszSample")}</button></div></div>
  </div>;
}
