"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { tapTempo } from "@/lib/tools/bpm";
import { clampTempo, commitTempo, draftTempo, TEMPO_MAX, TEMPO_MIN } from "@/lib/tools/metronome";
import { toolInput, toolPanel, toolPrimary, toolSecondary } from "@/components/tools/tool-ui";

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

/** Web Audio metronome: lookahead scheduler, accent on beat 1, tap tempo. */
export function Metronome({ initialBpm = 90 }: { initialBpm?: number }) {
  const [bpm, setBpm] = useState(initialBpm);
  /** Text of the tempo field while it is being typed. */
  const [draft, setDraft] = useState<string | null>(null);
  const [beats, setBeats] = useState(4);
  const [accent, setAccent] = useState(true);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState(-1);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const nextTimeRef = useRef(0);
  const beatRef = useRef(0);
  const settings = useRef({ bpm, beats, accent });
  const taps = useRef<number[]>([]);
  useEffect(() => {
    settings.current = { bpm, beats, accent };
  }, [bpm, beats, accent]);

  const click = useCallback((ctx: AudioContext, time: number, strong: boolean) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = strong ? 1600 : 1000;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.9 : 0.5, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setRunning(false);
    setCurrent(-1);
  }, []);

  const start = useCallback(async () => {
    // A second click while the sound engine wakes up must not start a second, unstoppable click.
    if (startingRef.current || timerRef.current !== null) return;
    startingRef.current = true;
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    try {
      await ctx.resume();
    } finally {
      startingRef.current = false;
    }
    if (ctx.state === "closed") return;
    beatRef.current = 0;
    nextTimeRef.current = ctx.currentTime + 0.05;
    timerRef.current = window.setInterval(() => {
      const { bpm: b, beats: n, accent: a } = settings.current;
      while (nextTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_S) {
        const beat = beatRef.current % n;
        click(ctx, nextTimeRef.current, a && beat === 0);
        const delay = Math.max(0, (nextTimeRef.current - ctx.currentTime) * 1000);
        window.setTimeout(() => setCurrent(beat), delay);
        nextTimeRef.current += 60 / b;
        beatRef.current++;
      }
    }, LOOKAHEAD_MS);
    setRunning(true);
  }, [click]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    void ctxRef.current?.close();
  }, []);

  const tap = () => {
    const now = performance.now();
    const last = taps.current[taps.current.length - 1];
    taps.current = last !== undefined && now - last > 2000 ? [now] : [...taps.current, now].slice(-9);
    const t = tapTempo(taps.current);
    if (t) setBpm(clampTempo(t));
  };

  return (
    <section className={toolPanel} aria-label="Metronom" data-testid="tool-metronome">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="brd-meta text-sm text-[var(--brd-mute)]">Tempo</p>
          <p className="brd-display text-6xl leading-none text-[var(--brd-ink)]" aria-live="polite">
            {bpm} <span className="text-2xl">BPM</span>
          </p>
        </div>
        <div className="flex gap-2" aria-hidden="true">
          {Array.from({ length: beats }, (_, i) => (
            <span
              key={i}
              className={`h-5 w-5 rounded-full border-2 border-[var(--brd-ink)] ${current === i ? (i === 0 && accent ? "bg-[var(--brd-red,#c0392b)]" : "bg-[var(--brd-green)]") : ""}`}
            />
          ))}
        </div>
      </div>
      <label className="mt-4 block">
        <span className="sr-only">Tempo w BPM</span>
        <input type="range" min={TEMPO_MIN} max={TEMPO_MAX} value={bpm} onChange={(e) => setBpm(clampTempo(Number(e.target.value)))} className="w-full accent-[var(--brd-green)]" />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={toolSecondary} onClick={() => setBpm((b) => clampTempo(b - 1))} aria-label="Wolniej o 1 BPM">−1</button>
        <input
          type="number"
          min={TEMPO_MIN}
          max={TEMPO_MAX}
          value={draft ?? bpm}
          onChange={(e) => {
            setDraft(e.target.value);
            const typed = draftTempo(e.target.value);
            if (typed !== null) setBpm(typed);
          }}
          onBlur={() => {
            if (draft !== null) setBpm(commitTempo(draft, bpm));
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className={`${toolInput} w-24`}
          aria-label="Tempo w BPM"
        />
        <button type="button" className={toolSecondary} onClick={() => setBpm((b) => clampTempo(b + 1))} aria-label="Szybciej o 1 BPM">+1</button>
        <button type="button" className={toolSecondary} onClick={tap}>Tap tempo</button>
        <label className="inline-flex min-h-11 items-center gap-2">
          <span className="text-sm">Metrum</span>
          <select value={beats} onChange={(e) => setBeats(Number(e.target.value))} className={toolInput}>
            {[2, 3, 4, 6, 7].map((n) => (
              <option key={n} value={n}>{n}/4</option>
            ))}
          </select>
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={accent} onChange={(e) => setAccent(e.target.checked)} /> Akcent na „raz”
        </label>
      </div>
      <button type="button" className={`${toolPrimary} mt-4 w-full sm:w-auto`} onClick={running ? stop : start} data-testid="metronome-toggle">
        {running ? "Stop" : "Start"}
      </button>
    </section>
  );
}
