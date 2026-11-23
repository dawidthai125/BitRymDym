"use client";

import { useRef, useState } from "react";

import { estimateBpm, monoExcerpt, tapTempo, type BpmEstimate } from "@/lib/tools/bpm";
import { toolPanel, toolPrimary, toolSecondary } from "@/components/tools/tool-ui";

/** Tap tempo + BPM from a local audio file (decoded in the browser, never uploaded). */
export function BpmCounter() {
  const [taps, setTaps] = useState<number[]>([]);
  const [file, setFile] = useState<{ name: string; result: BpmEstimate | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tapped = tapTempo(taps);

  const tap = () => {
    const now = performance.now();
    setTaps((t) => {
      const last = t[t.length - 1];
      return last !== undefined && now - last > 2000 ? [now] : [...t, now].slice(-17);
    });
  };

  const analyse = async (f: File) => {
    setBusy(true);
    setError(null);
    setFile(null);
    try {
      const ctx = new AudioContext();
      const audio = await ctx.decodeAudioData(await f.arrayBuffer());
      void ctx.close();
      const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
      const mono = monoExcerpt(channels, audio.sampleRate, 60);
      setFile({ name: f.name, result: estimateBpm(mono, audio.sampleRate) });
    } catch {
      setError("Nie udało się odczytać pliku. Spróbuj MP3, WAV albo M4A.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="tool-bpm">
      <section className={toolPanel} aria-labelledby="bpm-tap">
        <h2 id="bpm-tap" className="brd-display text-2xl text-[var(--brd-ink)]">Tap tempo</h2>
        <p className="mt-1 text-sm text-[var(--brd-mute)]">Stukaj w rytm stopy (albo spacją, gdy przycisk jest zaznaczony). Po 2 s przerwy liczenie startuje od nowa.</p>
        <p className="brd-display mt-3 text-6xl leading-none text-[var(--brd-ink)]" aria-live="polite">
          {tapped ? Math.round(tapped) : "—"} <span className="text-2xl">BPM</span>
        </p>
        {tapped ? <p className="brd-meta mt-1 text-sm text-[var(--brd-mute)]">dokładnie {tapped} · połowa {Math.round(tapped / 2)} · podwójnie {Math.round(tapped * 2)} · uderzeń: {taps.length}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={`${toolPrimary} min-w-40`} onClick={tap} data-testid="bpm-tap-button">Stuknij</button>
          <button type="button" className={toolSecondary} onClick={() => setTaps([])}>Wyzeruj</button>
        </div>
      </section>
      <section className={toolPanel} aria-labelledby="bpm-file">
        <h2 id="bpm-file" className="brd-display text-2xl text-[var(--brd-ink)]">BPM z pliku</h2>
        <p className="mt-1 text-sm text-[var(--brd-mute)]">Wybierz bit albo piosenkę z dysku. Liczymy w Twojej przeglądarce — plik nigdzie nie jest wysyłany.</p>
        <input ref={inputRef} type="file" accept="audio/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void analyse(f); e.target.value = ""; }} />
        <button type="button" className={`${toolPrimary} mt-4`} disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Liczę…" : "Wybierz plik audio"}
        </button>
        {error ? <p className="mt-3 text-sm" role="alert">{error}</p> : null}
        {file ? (
          file.result ? (
            <div className="mt-4" aria-live="polite">
              <p className="text-sm text-[var(--brd-mute)]">{file.name}</p>
              <p className="brd-display text-6xl leading-none text-[var(--brd-ink)]">{Math.round(file.result.bpm)} <span className="text-2xl">BPM</span></p>
              <p className="brd-meta mt-1 text-sm text-[var(--brd-mute)]">
                Jeśli brzmi za szybko albo za wolno: {Math.round(file.result.half)} lub {Math.round(file.result.double)} BPM (half-time / double-time).
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm">Nie znaleźliśmy wyraźnego rytmu w tym pliku. Użyj tap tempo.</p>
          )
        ) : null}
      </section>
    </div>
  );
}
