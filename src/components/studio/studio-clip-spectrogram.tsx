"use client";

import { useEffect, useRef, useState } from "react";

import { StudioClipInspect } from "@/components/studio/studio-clip-inspect";

const MAX_SECONDS = 20;

type Load =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; samples: Float32Array; sampleRate: number }
  | { status: "empty" }
  | { status: "error" };

/** Decodes the selected clip and shows its spectrogram. Cleaning is a local preview. */
export function StudioClipSpectrogram({
  clipId,
  resolveUrl,
}: {
  clipId: string | null;
  resolveUrl: () => Promise<string | null>;
}) {
  if (!clipId) return null;
  return <StudioClipSpectrogramBody key={clipId} clipId={clipId} resolveUrl={resolveUrl} />;
}

function StudioClipSpectrogramBody({
  clipId,
  resolveUrl,
}: {
  clipId: string;
  resolveUrl: () => Promise<string | null>;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [heard, setHeard] = useState<string | null>(null);
  const resolveRef = useRef(resolveUrl);
  useEffect(() => {
    resolveRef.current = resolveUrl;
  });

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const url = await resolveRef.current();
        if (!live) return;
        if (!url) {
          setLoad({ status: "empty" });
          return;
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error("fetch");
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(await response.arrayBuffer());
        const channel = audio.getChannelData(0);
        const frames = Math.min(channel.length, Math.floor(audio.sampleRate * MAX_SECONDS));
        const samples = new Float32Array(frames);
        samples.set(channel.subarray(0, frames));
        await ctx.close().catch(() => undefined);
        if (!live) return;
        setLoad({ status: "ready", samples, sampleRate: audio.sampleRate });
      } catch {
        if (live) setLoad({ status: "error" });
      }
    })();
    return () => {
      live = false;
    };
  }, [clipId]);

  async function preview(out: Float32Array) {
    const rate = load.status === "ready" ? load.sampleRate : 48000;
    const ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, out.length, rate);
    buffer.getChannelData(0).set(out);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      void ctx.close().catch(() => undefined);
    };
    source.start();
    setHeard("Podgląd czyszczenia gra lokalnie. Nie zapisuje się w projekcie.");
  }

  return (
    <div className="flex flex-col gap-2" data-testid="studio-clip-spectrogram">
      {load.status === "loading" ? <p className="text-sm text-[var(--brd-ink-soft)]">Liczę spektrogram…</p> : null}
      {load.status === "empty" || load.status === "error" ? (
        <p className="text-sm text-[var(--brd-ink-soft)]">Nie udało się odczytać klipu do spektrogramu.</p>
      ) : null}
      {load.status === "ready" ? (
        <StudioClipInspect samples={load.samples} sampleRate={load.sampleRate} onApply={(out) => void preview(out)} />
      ) : null}
      {heard ? <p className="text-xs text-[var(--brd-ink-soft)]">{heard}</p> : null}
    </div>
  );
}
