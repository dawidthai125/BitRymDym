"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  applyNoiseProfile,
  noiseProfileFromSelection,
  spectrogramColumns,
} from "@/lib/studio/studio-clip-noise";

export type StudioClipInspectProps = {
  samples: Float32Array | null;
  sampleRate: number;
  onApply: (out: Float32Array) => void;
};

function cssColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function StudioClipInspect({ samples, sampleRate, onApply }: StudioClipInspectProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const columns = useMemo(
    () => spectrogramColumns(samples && samples.length > 0 ? samples : new Float32Array(0), 64, 48),
    [samples],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !samples || samples.length === 0) return;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 640;
      const cssH = canvas.clientHeight || 128;
      canvas.width = Math.max(1, Math.floor(cssW * dpr));
      canvas.height = Math.max(1, Math.floor(cssH * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const paper = cssColor("--brd-paper", "#f4f1ea");
      const ink = cssColor("--brd-ink", "#1a1a1a");
      ctx.fillStyle = paper;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const cols = columns.length;
      const rows = columns[0]?.length ?? 0;
      if (cols === 0 || rows === 0) return;
      const cw = canvas.width / cols;
      const rh = canvas.height / rows;
      ctx.fillStyle = ink;
      for (let c = 0; c < cols; c += 1) {
        const col = columns[c] ?? [];
        for (let r = 0; r < rows; r += 1) {
          const v = col[rows - 1 - r] ?? 0;
          if (v <= 0) continue;
          ctx.globalAlpha = Math.min(1, v);
          ctx.fillRect(Math.floor(c * cw), Math.floor(r * rh), Math.ceil(cw), Math.ceil(rh));
        }
      }
      ctx.globalAlpha = 1;
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [columns, samples]);

  function applyProfile() {
    if (!samples || samples.length === 0) return;
    try {
      const profile = noiseProfileFromSelection(samples, sampleRate);
      const out = applyNoiseProfile(samples, sampleRate, profile, 0.6);
      setError(null);
      onApply(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg.startsWith("NOISE_TOO_SHORT") ? "Zaznaczenie jest za krótkie." : "Nie udało się zastosować profilu.");
    }
  }

  if (!samples || samples.length === 0) {
    return (
      <section
        data-testid="studio-clip-inspect"
        className="border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3 text-sm text-[var(--brd-ink)]"
      >
        <p>Zaznacz fragment klipu.</p>
      </section>
    );
  }

  return (
    <section
      data-testid="studio-clip-inspect"
      className="space-y-2 border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3 text-[var(--brd-ink)]"
    >
      <canvas
        ref={canvasRef}
        className="h-32 w-full border border-[var(--brd-line)]"
        role="img"
        aria-label="Spektrogram klipu"
      />
      <button
        type="button"
        onClick={applyProfile}
        className="inline-flex min-h-11 items-center border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3 text-sm text-[var(--brd-ink)]"
      >
        Zastosuj profil szumu
      </button>
      {error ? (
        <p role="status" className="text-xs text-[var(--brd-ink)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
