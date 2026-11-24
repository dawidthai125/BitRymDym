"use client";

import { useRef, useState } from "react";

import { estimateBpm, monoExcerpt, tapTempo, type BpmEstimate } from "@/lib/tools/bpm";
import { toolPanel, toolPrimary, toolSecondary } from "@/components/tools/tool-ui";

type FileKey = { label: string; relative: string; sure: boolean };

/** Musical key of the excerpt (same detector as Studio, loaded only when a file is analysed). */
async function keyOf(mono: Float32Array, sampleRate: number): Promise<FileKey | null> {
  const [{ detectKeyFromAudio }, { TUNE_KEY_NAMES }] = await Promise.all([import("@/lib/studio/tune/key-detect"), import("@/lib/studio/tune/tune")]);
  const k = detectKeyFromAudio([mono], sampleRate);
  if (!k) return null;
  const minor = k.scale === 1;
  const name = (root: number, min: boolean) => `${TUNE_KEY_NAMES[(root + 12) % 12]}${min ? "m" : ""}`;
  return {
    label: `${name(k.keyRoot, minor)} (${minor ? "moll" : "dur"})`,
    relative: name(k.keyRoot + (minor ? 3 : -3), !minor),
    sure: k.score >= 0.7 && k.margin >= 0.05,
  };
}

/** Tap tempo + BPM and key from a local audio file (decoded in the browser, never uploaded). */
export function BpmCounter() {
  const [taps, setTaps] = useState<number[]>([]);
  const [file, setFile] = useState<{ name: string; result: BpmEstimate | null; key: FileKey | null } | null>(null);
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
      setFile({ name: f.name, result: estimateBpm(mono, audio.sampleRate), key: await keyOf(mono, audio.sampleRate).catch(() => null) });
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
        <h2 id="bpm-file" className="brd-display text-2xl text-[var(--brd-ink)]">BPM i tonacja z pliku</h2>
        <p className="mt-1 text-sm text-[var(--brd-mute)]">Wybierz bit albo piosenkę z dysku. Liczymy w Twojej przeglądarce — plik nigdzie nie jest wysyłany.</p>
        <input ref={inputRef} type="file" accept="audio/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void analyse(f); e.target.value = ""; }} />
        <button type="button" className={`${toolPrimary} mt-4`} disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Liczę…" : "Wybierz plik audio"}
        </button>
        {error ? <p className="mt-3 text-sm" role="alert">{error}</p> : null}
        {file?.key ? (
          <p className="mt-4 text-[var(--brd-ink)]" data-testid="file-key">
            Tonacja: <strong>{file.key.label}</strong>
            <span className="text-sm text-[var(--brd-mute)]"> · równoległa: {file.key.relative}{file.key.sure ? "" : " · wynik niepewny, sprawdź na słuch"}</span>
          </p>
        ) : null}
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
