"use client";

import { useEffect, useRef, useState } from "react";

import { StudioClipInspect } from "@/components/studio/studio-clip-inspect";
import { emitStudioTakeSourceChanged } from "@/lib/studio/cleanup/cleanup-events";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { applyNoiseProfile, noiseProfileFromSelection } from "@/lib/studio/studio-clip-noise";
import { encodeMonoWav16 } from "@/lib/studio/studio-wav-mono";

const PREVIEW_SECONDS = 20;
const MAX_SECONDS = 360;
const ARTIFACTS = "audio-artifacts";

type Load =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; samples: Float32Array; sampleRate: number }
  | { status: "empty" }
  | { status: "error" };

/** Spectrogram of the first 20 seconds. Saving cleans the whole take, up to 6 minutes. */
export function StudioClipSpectrogram({
  clipId,
  projectId,
  takeId,
  resolveUrl,
}: {
  clipId: string | null;
  projectId: string;
  takeId: string | null;
  resolveUrl: () => Promise<string | null>;
}) {
  if (!clipId) return null;
  return (
    <StudioClipSpectrogramBody
      key={clipId}
      clipId={clipId}
      projectId={projectId}
      takeId={takeId}
      resolveUrl={resolveUrl}
    />
  );
}

function StudioClipSpectrogramBody({
  clipId,
  projectId,
  takeId,
  resolveUrl,
}: {
  clipId: string;
  projectId: string;
  takeId: string | null;
  resolveUrl: () => Promise<string | null>;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [heard, setHeard] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
        const decoded = await decodeUrl(url);
        if (!live) return;
        const frames = Math.min(decoded.samples.length, Math.floor(decoded.sampleRate * PREVIEW_SECONDS));
        const samples = new Float32Array(frames);
        samples.set(decoded.samples.subarray(0, frames));
        setLoad({ status: "ready", samples, sampleRate: decoded.sampleRate });
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
    setHeard("Podgląd gra lokalnie. Zapis jest osobnym przyciskiem.");
  }

  async function save() {
    if (!takeId || saving) return;
    setSaving(true);
    setHeard("Liczenie pełnego nagrania…");
    try {
      const url = await resolveRef.current();
      if (!url) {
        setHeard("Nie udało się odczytać nagrania.");
        return;
      }
      const full = await decodeUrl(url);
      if (full.samples.length > Math.floor(full.sampleRate * MAX_SECONDS)) {
        setHeard("Nagranie jest dłuższe niż 6 minut. Nie zapisuję.");
        return;
      }
      const profileFrom = full.samples.subarray(0, Math.min(full.samples.length, Math.floor(full.sampleRate * PREVIEW_SECONDS)));
      const profile = noiseProfileFromSelection(profileFrom, full.sampleRate);
      const cleaned = applyNoiseProfile(full.samples, full.sampleRate, profile, 0.6);
      if (cleaned.length !== full.samples.length) {
        setHeard("Wynik ma inną długość niż nagranie. Nie zapisuję.");
        return;
      }
      const wav = encodeMonoWav16(cleaned, full.sampleRate);
      const prepRes = await fetch(`/api/studio/projects/${projectId}/clips/${clipId}/noise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare" }),
      });
      const prep = (await prepRes.json().catch(() => ({}))) as { ok?: boolean; path?: string; token?: string; jobId?: string; error?: string };
      if (!prepRes.ok || !prep.ok || !prep.path || !prep.token || !prep.jobId) {
        setHeard(prep.error === "take_unavailable" ? "To nagranie nie jest gotowe do podmiany." : "Nie udało się przygotować zapisu.");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const blob = new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" });
      const { error: uploadError } = await supabase.storage.from(ARTIFACTS).uploadToSignedUrl(prep.path, prep.token, blob, {
        contentType: "audio/wav",
      });
      if (uploadError) {
        setHeard("Nie udało się wysłać pliku.");
        return;
      }
      const commitRes = await fetch(`/api/studio/projects/${projectId}/clips/${clipId}/noise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", jobId: prep.jobId }),
      });
      const commit = (await commitRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!commitRes.ok || !commit.ok) {
        setHeard(commit.error === "truncated" ? "Plik był krótszy niż nagranie. Nie podmieniam go." : "Nie udało się zapisać czyszczenia.");
        return;
      }
      emitStudioTakeSourceChanged(takeId);
      setHeard("Zapisane. Odtwarzanie użyje oczyszczonego nagrania w pełnej długości.");
    } catch {
      setHeard("Nie udało się zapisać czyszczenia.");
    } finally {
      setSaving(false);
    }
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
      {takeId ? (
        <button
          type="button"
          data-testid="studio-clip-noise-save"
          disabled={saving || load.status !== "ready"}
          onClick={() => void save()}
          className="w-fit border border-[var(--brd-line)] px-3 py-2 text-sm text-[var(--brd-ink)] hover:border-[var(--brd-amber)] disabled:opacity-50"
        >
          {saving ? "Zapisuję…" : "Zapisz czyszczenie w projekcie"}
        </button>
      ) : (
        <p className="text-xs text-[var(--brd-ink-soft)]">Zapis czyszczenia jest tylko dla nagrania wokalu.</p>
      )}
      {heard ? <p className="text-xs text-[var(--brd-ink-soft)]">{heard}</p> : null}
    </div>
  );
}

async function decodeUrl(url: string): Promise<{ samples: Float32Array; sampleRate: number }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("fetch");
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(await response.arrayBuffer());
    const channel = audio.getChannelData(0);
    const samples = new Float32Array(channel.length);
    samples.set(channel);
    return { samples, sampleRate: audio.sampleRate };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
