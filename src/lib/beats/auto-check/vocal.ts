/**
 * Vocal detection via self-hosted Demucs (htdemucs, two stems) run by
 * scripts/auto-check/vocal_ratio.py. Pure parsing lives here for tests.
 */
import type { VocalResult, VocalWindow } from "@/lib/beats/auto-check/types";

export type VocalScriptOutput = {
  ok: boolean;
  error?: string;
  ratio?: number;
  windows?: VocalWindow[];
  prescreen?: number | null;
  model?: string;
};

export function parseVocalScriptOutput(stdout: string): VocalResult {
  let out: VocalScriptOutput;
  try {
    out = JSON.parse(stdout.trim().split("\n").pop() ?? "") as VocalScriptOutput;
  } catch {
    return { outcome: "error", method: "demucs", ratio: null, windows: [], errorCode: "vocal_bad_output" };
  }
  const method = `demucs-${out.model ?? "htdemucs"}`;
  if (!out.ok || typeof out.ratio !== "number" || !Number.isFinite(out.ratio)) {
    return { outcome: "error", method, ratio: null, windows: [], prescreenScore: out.prescreen ?? null, errorCode: out.error ?? "vocal_failed" };
  }
  return {
    outcome: "ok",
    method,
    ratio: Math.min(1, Math.max(0, out.ratio)),
    windows: (out.windows ?? []).slice(0, 50),
    prescreenScore: out.prescreen ?? null,
  };
}
