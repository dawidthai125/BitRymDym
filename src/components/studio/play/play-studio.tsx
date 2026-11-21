"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { PlayEngine, LoopPlayer } from "@/lib/studio/play/instrument-engine";
import { renderSessionWav } from "@/lib/studio/play/render-session";
import { CHORD_CODES, chordIndexForCode, noteForCode, octaveShiftForCode, shiftBaseNote } from "@/lib/studio/play/keyboard-map";
import { DEFAULT_CHORD_SET, findChord, strum } from "@/lib/studio/play/guitar-chords";
import { quickFix } from "@/lib/studio/play/sampek-edit";
import { SampekPanel } from "@/components/studio/play/sampek-panel";
import type { PlayInstrumentId, PlayLayer, PlaySession, SampekResult } from "@/lib/studio/play/play-types";
import { cn } from "@/lib/utils";

const INSTRUMENTS: { id: PlayInstrumentId; label: string }[] = [
  { id: "piano", label: "Pianino" }, { id: "epiano", label: "E-piano" }, { id: "guitar", label: "Gitara" },
  { id: "synth-lead", label: "Syntezator lead" }, { id: "synth-pad", label: "Pad" }, { id: "synth-bass", label: "Syntezator basu" },
  { id: "hiphop", label: "Bębny hip-hop" },
];
const WHITE_KEYS = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL"];

export function PlayStudio({ bpm, beatId, canUseAi }: { bpm: number; beatId?: string | null; canUseAi: boolean }) {
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
  const [rights, setRights] = useState(false);

  useEffect(() => { sessionRef.current = session; loop.current?.setSession(session); }, [session]);
  useEffect(() => () => { engine.current?.allOff(); loop.current?.stop(); }, []);
  // The bpm prop changed: adjust the session while rendering (no effect round-trip).
  const [sessionBpmProp, setSessionBpmProp] = useState(bpm);
  if (sessionBpmProp !== bpm) {
    setSessionBpmProp(bpm);
    setSession((s) => ({ ...s, bpm }));
  }

  async function prepare(requestedInstrument: PlayInstrumentId = instrument) {
    const e = engine.current ?? new PlayEngine();
    engine.current = e;
    loop.current ??= new LoopPlayer(e);
    setLoading(true);
    try { await e.load(requestedInstrument); setStatus("Instrument gotowy."); } catch { setStatus("Nie udało się wczytać instrumentu."); }
    setLoading(false);
  }

  function ensureLayer(id: PlayInstrumentId): PlayLayer {
    const existing = sessionRef.current.layers.find((l) => l.instrument === id);
    if (existing) return existing;
    const next = { id: `layer-${Date.now()}`, instrument: id, gain: 1, notes: [] } as PlayLayer;
    setSession((s) => ({ ...s, layers: [...s.layers, next] }));
    return next;
  }

  function noteOn(key: string, note: number, velocity = 0.8) {
    const e = engine.current; if (!e) return;
    const layer = ensureLayer(instrument);
    e.noteOn(key, instrument, note, velocity, layer.synth, layer.gain);
    if (!recording || !loop.current?.running) return;
    held.current.set(key, { layerId: layer.id, note, start: Math.max(0, loop.current.beatsSinceStart()), velocity });
  }

  function noteOff(key: string) {
    engine.current?.noteOff(key);
    const h = held.current.get(key); if (!h || !loop.current) return;
    held.current.delete(key);
    const end = Math.max(h.start + 0.125, Math.min(sessionRef.current.bars * 4, loop.current.beatsSinceStart()));
    setSession((s) => ({ ...s, layers: s.layers.map((l) => l.id === h.layerId ? { ...l, notes: [...l.notes, { t: h.start, d: end - h.start, n: h.note, v: h.velocity }].slice(-512) } : l) }));
  }

  function guitarAction(key: string, direction: "down" | "up") {
    const idx = chordIndexForCode(key); if (idx == null) return;
    const chord = findChord(DEFAULT_CHORD_SET[idx]!); if (!chord || !engine.current) return;
    for (const hit of strum(chord, direction, direction === "down" ? 1.3 : 0.8)) noteOn(`g-${key}-${hit.string}`, hit.note, hit.velocity);
    window.setTimeout(() => strum(chord, direction, 1).forEach((hit) => noteOff(`g-${key}-${hit.string}`)), 180);
  }

  // Latest note handlers for the window key listeners (they are fresh functions every render).
  const keyHandlers = useRef({ noteOn, noteOff, guitarAction });
  useLayoutEffect(() => {
    keyHandlers.current = { noteOn, noteOff, guitarAction };
  });
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      const code = ev.code;
      if (code === "KeyZ" || code === "KeyX") { setBase((b) => shiftBaseNote(b, octaveShiftForCode(code)!)); return; }
      if (instrument === "guitar" && (CHORD_CODES as readonly string[]).includes(code)) { keyHandlers.current.guitarAction(code, "down"); return; }
      const n = noteForCode(code, base); if (n == null) return;
      ev.preventDefault(); keyHandlers.current.noteOn(code, n, ev.shiftKey ? 1 : 0.8);
    };
    const up = (ev: KeyboardEvent) => { if (instrument === "guitar") return; keyHandlers.current.noteOff(ev.code); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [base, instrument, recording]);

  function toggleRecord() {
    if (!loop.current) return;
    if (recording) { loop.current.stop(); setRecording(false); setPlaying(false); held.current.forEach((_, k) => noteOff(k)); return; }
    loop.current.setSession(sessionRef.current); loop.current.setMetronome(true); loop.current.start(4); setRecording(true); setPlaying(true); setStatus("Odliczanie i nagrywanie…");
  }
  function togglePlay() {
    if (!loop.current) return;
    if (playing) { loop.current.stop(); setPlaying(false); return; }
    loop.current.setSession(sessionRef.current); loop.current.setMetronome(false); loop.current.start(0); setPlaying(true);
  }
  function apply(result: SampekResult) { setSession(result.session); setStatus(result.changes.join(" ")); }

  async function save() {
    if (!rights || !session.layers.some((l) => l.notes.length)) return;
    setStatus("Renderuję WAV…");
    try {
      const rendered = await renderSessionWav(session, "loop");
      const form = new FormData(); form.set("file", new File([rendered.wav.buffer as ArrayBuffer], "graj-sample.wav", { type: "audio/wav" }));
      form.set("title", (title.trim() || `Graj · ${INSTRUMENTS.find((x) => x.id === instrument)?.label ?? instrument}`).slice(0, 80));
      form.set("kind", "instrument"); form.set("instrument", instrument); form.set("rightsAccepted", "1"); form.set("lab", "1"); form.set("sampleType", "loop"); form.set("source", "studio"); form.set("bpm", String(Math.round(session.bpm))); form.set("bars", String(session.bars));
      if (session.key) form.set("musicalKey", session.key); if (beatId) form.set("beatId", beatId);
      const response = await fetch("/api/studio/samples", { method: "POST", body: form });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { message?: string }).message ?? "Nie udało się zapisać.");
      setStatus("Sampel zapisany w Twoich samplach."); setTitle("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Nie udało się zapisać."); }
  }

  const noteKeys = useMemo(() => WHITE_KEYS.map((code, i) => ({ code, note: base + [0, 2, 4, 5, 7, 9, 11, 12, 14][i]! })), [base]);
  return <div className="space-y-5 rounded-lg border border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/30 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Graj — zbuduj sample ręcznie</h2><p className="mt-1 text-sm text-[var(--brd-ink-soft)]">Kilka klawiszy naraz, myszka i prawdziwe nagrania instrumentów. Sampek poprawi dopiero to, co zagrasz.</p></div><span className="rounded-full border border-[var(--brd-amber)] px-3 py-1 text-xs">{Math.round(session.bpm)} BPM · {session.bars} takty</span></div>
    <div className="flex flex-wrap items-end gap-3"><label className="min-w-44"><span className="mb-1 block text-xs uppercase text-[var(--brd-ink-soft)]">Instrument</span><select className="min-h-11 w-full rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3" value={instrument} onChange={(e) => { const id = e.target.value as PlayInstrumentId; setInstrument(id); void prepare(id); }}>{INSTRUMENTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label><label><span className="mb-1 block text-xs uppercase text-[var(--brd-ink-soft)]">Takty</span><select className="min-h-11 rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3" value={session.bars} onChange={(e) => setSession((s) => ({ ...s, bars: Number(e.target.value) }))}>{[1, 2, 4, 8].map((n) => <option key={n} value={n}>{n}</option>)}</select></label><button type="button" onClick={() => void prepare()} disabled={loading} className="min-h-11 rounded-md border border-[var(--brd-amber)] px-4 text-sm font-semibold">{loading ? "Wczytuję…" : "Włącz instrument"}</button></div>
    <div className="rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4"><p className="mb-3 text-xs text-[var(--brd-ink-soft)]">Pianino: A S D F G H J K L · czarne klawisze W E T Y U · Z/X zmiana oktawy. Gitara: 1–8 wybór akordu, przeciągnięcie zastępuje spacja.</p>{instrument === "guitar" ? <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">{DEFAULT_CHORD_SET.map((chord, i) => <button key={chord} type="button" onPointerDown={() => guitarAction(CHORD_CODES[i]!, "down")} className="min-h-16 rounded-md border border-[var(--brd-line)] text-lg font-semibold hover:border-[var(--brd-amber)]">{chord}<span className="block text-xs text-[var(--brd-ink-soft)]">{i + 1}</span></button>)}</div> : <div className="flex overflow-x-auto pb-2">{noteKeys.map(({ code, note }) => <button key={code} type="button" onPointerDown={() => noteOn(`mouse-${code}`, note)} onPointerUp={() => noteOff(`mouse-${code}`)} onPointerLeave={() => noteOff(`mouse-${code}`)} className={cn("h-28 min-w-12 border border-[var(--brd-line)] bg-[var(--brd-paper)] text-sm font-semibold hover:bg-[var(--brd-amber)]/20", [1, 3, 6, 8, 10].includes(note % 12) && "bg-[var(--brd-paper-deep)]")}>{code.replace("Key", "")}</button>)}</div>}</div>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={async () => { if (!recording) await prepare(); toggleRecord(); }} className="min-h-12 rounded-md bg-[var(--brd-rec)] px-5 font-semibold text-white">{recording ? "■ Zatrzymaj nagrywanie" : "● Nagraj pętlę"}</button><button type="button" onClick={togglePlay} className="min-h-12 rounded-md border border-[var(--brd-line)] px-5">{playing && !recording ? "■ Stop" : "▶ Odtwórz"}</button><button type="button" onClick={() => apply(quickFix(session))} className="min-h-12 rounded-md border border-[var(--brd-amber)] px-4">Szybka poprawa</button></div>
    {status ? <p role="status" className="text-sm text-[var(--brd-ink-soft)]">{status}</p> : null}
    {session.layers.some((l) => l.notes.length) ? <SampekPanel session={session} canUseAi={canUseAi} onPreview={(s) => { if (!s) { loop.current?.stop(); setPlaying(false); return; } loop.current?.setSession(s); loop.current?.start(0); setPlaying(true); }} onApply={apply} /> : <p className="text-sm text-[var(--brd-ink-soft)]">Zagraj kilka nut, żeby pojawiły się poprawki Sampeka i zapis.</p>}
    <div className="grid gap-3 border-t border-[var(--brd-line)] pt-4 md:grid-cols-[1fr_auto] md:items-end"><label><span className="mb-1 block text-xs uppercase text-[var(--brd-ink-soft)]">Nazwa sampla</span><input className="min-h-11 w-full rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. Rhodes po nocnym spacerze" /></label><div><label className="mb-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1" /> Mam prawa do użytych nagrań.</label><button type="button" onClick={() => void save()} disabled={!rights || !session.layers.some((l) => l.notes.length)} className="min-h-11 rounded-md bg-[var(--brd-amber)] px-5 font-semibold text-[var(--brd-on-media)] disabled:opacity-40">Zapisz sample</button></div></div>
  </div>;
}
