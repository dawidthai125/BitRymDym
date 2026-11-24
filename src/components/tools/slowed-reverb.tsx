"use client";

import { useEffect, useRef, useState } from "react";

import { renderSlowed, semitoneShift, SLOWED_LIMITS, slowedSeconds, type SlowedSettings } from "@/lib/tools/slowed";
import { encodeWav16, limitPeak } from "@/lib/tools/wav";
import { toolPanel, toolPrimary, toolSecondary } from "@/components/tools/tool-ui";

const PRESETS: { label: string; settings: SlowedSettings }[] = [
  { label: "Slowed + reverb", settings: { speed: 85, reverb: 35, tail: 3 } },
  { label: "Mocno zwolnione", settings: { speed: 75, reverb: 45, tail: 4 } },
  { label: "Sam reverb", settings: { speed: 100, reverb: 40, tail: 3 } },
  { label: "Przyspieszone", settings: { speed: 120, reverb: 0, tail: 2 } },
];
const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Slowed + reverb (or sped up) version of a local file, rendered in the browser. */
export function SlowedReverb() {
  const [source, setSource] = useState<{ name: string; buffer: AudioBuffer } | null>(null);
  const [settings, setSettings] = useState<SlowedSettings>(PRESETS[0]!.settings);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState<"read" | "render" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const url = useRef<string | null>(null);

  const clearResult = () => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setResult(null);
  };
  useEffect(() => () => {
    if (url.current) URL.revokeObjectURL(url.current);
  }, []);

  const change = (patch: Partial<SlowedSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    clearResult();
  };

  const read = async (file: File) => {
    setError(null);
    clearResult();
    if (file.size > SLOWED_LIMITS.maxBytes) {
      setError("Plik jest za duży. Limit to 80 MB.");
      return;
    }
    setBusy("read");
    try {
      const ctx = new AudioContext();
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer()).finally(() => void ctx.close());
      if (buffer.duration > SLOWED_LIMITS.maxSeconds) setError("Plik jest za długi. Limit to 10 minut.");
      else setSource({ name: file.name, buffer });
    } catch {
      setError("Nie udało się odczytać pliku. Spróbuj MP3, WAV albo M4A.");
    } finally {
      setBusy(null);
    }
  };

  const render = async () => {
    if (!source) return;
    setBusy("render");
    setError(null);
    clearResult();
    try {
      const out = await renderSlowed(source.buffer, settings);
      const channels = [out.getChannelData(0), out.getChannelData(1)];
      limitPeak(channels);
      url.current = URL.createObjectURL(new Blob([encodeWav16(channels, out.sampleRate)], { type: "audio/wav" }));
      setResult({ url: url.current, name: `${source.name.replace(/\.[^.]+$/, "")}-${settings.speed}.wav` });
    } catch {
      setError("Nie udało się przeliczyć pliku. Na telefonie spróbuj krótszego nagrania.");
    } finally {
      setBusy(null);
    }
  };

  const shift = semitoneShift(settings.speed);
  const slider = "mt-1 w-full accent-[var(--brd-green)]";
  return (
    <section className={toolPanel} aria-label="Slowed + reverb" data-testid="tool-slowed">
      <input ref={input} type="file" accept="audio/*" className="sr-only" aria-label="Plik audio" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ""; }} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={source ? toolSecondary : toolPrimary} disabled={busy !== null} onClick={() => input.current?.click()}>
          {busy === "read" ? "Wczytuję…" : source ? "Zmień plik" : "Wybierz plik audio"}
        </button>
        {source ? <p className="min-w-0 break-words text-sm text-[var(--brd-ink-soft)]">{source.name} · {time(source.buffer.duration)}</p> : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Gotowe ustawienia">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className={toolSecondary} disabled={busy !== null} onClick={() => change(p.settings)}>{p.label}</button>
        ))}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="text-sm text-[var(--brd-ink-soft)]">
          Prędkość: <strong>{settings.speed}%</strong> {shift !== 0 ? `(${shift > 0 ? "+" : ""}${String(shift).replace(".", ",")} półtonu)` : ""}
          <input type="range" min={SLOWED_LIMITS.speedMin} max={SLOWED_LIMITS.speedMax} value={settings.speed} disabled={busy !== null} onChange={(e) => change({ speed: Number(e.target.value) })} className={slider} />
        </label>
        <label className="text-sm text-[var(--brd-ink-soft)]">
          Pogłos: <strong>{settings.reverb}%</strong>
          <input type="range" min={0} max={100} value={settings.reverb} disabled={busy !== null} onChange={(e) => change({ reverb: Number(e.target.value) })} className={slider} />
        </label>
        <label className="text-sm text-[var(--brd-ink-soft)]">
          Długość pogłosu: <strong>{String(settings.tail).replace(".", ",")} s</strong>
          <input type="range" min={1} max={6} step={0.5} value={settings.tail} disabled={busy !== null} onChange={(e) => change({ tail: Number(e.target.value) })} className={slider} />
        </label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className={toolPrimary} disabled={!source || busy !== null} onClick={() => void render()} data-testid="slowed-render">
          {busy === "render" ? "Przeliczam…" : "Zrób wersję"}
        </button>
        {source ? <span className="text-sm text-[var(--brd-mute)]">Wynik: {time(slowedSeconds(source.buffer.duration, settings))}</span> : null}
      </div>
      {error ? <p className="mt-3 text-sm" role="alert">{error}</p> : null}
      {result ? (
        <div className="mt-4 flex flex-wrap items-center gap-3" data-testid="slowed-result">
          <audio controls src={result.url} className="max-w-full" aria-label="Gotowa wersja" />
          <a href={result.url} download={result.name} className={`${toolSecondary} inline-flex items-center`}>Pobierz WAV</a>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-[var(--brd-mute)]">Plik jest liczony w Twojej przeglądarce i nigdzie nie jest wysyłany. Publikuj tylko nagrania, do których masz prawa.</p>
    </section>
  );
}
