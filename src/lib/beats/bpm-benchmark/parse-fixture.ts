/**
 * Parse known-BPM fixture filenames (outside git).
 *
 * Conventions:
 * - bpm-<BPM>-steady.(wav|mp3)                         → SYNTHETIC
 * - rap-boombap-<BPM>[ -<sourceTag> ].(wav|mp3)         → RAP_BOOMBAP
 * - rap-trap-<BPM>[ -<sourceTag> ].(wav|mp3)            → RAP_TRAP
 * - rap-drill-<BPM>[ -<sourceTag> ].(wav|mp3)           → RAP_DRILL
 *
 * Optional sourceTag (e.g. fs680221) allows multiple fixtures at the same BPM
 * without changing expected-BPM parsing. Expected BPM is always the first number.
 */

import type {
  BenchmarkFormat,
  BenchmarkGenre,
  BenchmarkLayer,
  FixtureMeta,
} from "@/lib/beats/bpm-benchmark/types";

const EXT_FORMAT: Record<string, BenchmarkFormat> = {
  wav: "WAV",
  mp3: "MP3",
};

/** Optional `-fs123` / `-freesound-123` style suffix after BPM. */
const SOURCE_SUFFIX = "(?:-[a-z0-9][a-z0-9_-]*)?";

const PATTERNS: Array<{
  re: RegExp;
  layer: BenchmarkLayer;
  genre: BenchmarkGenre;
}> = [
  {
    re: /^bpm-(\d+(?:\.\d+)?)-steady\.(wav|mp3)$/i,
    layer: "SYNTHETIC",
    genre: "synthetic",
  },
  {
    re: new RegExp(
      `^rap-boombap-(\\d+(?:\\.\\d+)?)${SOURCE_SUFFIX}\\.(wav|mp3)$`,
      "i",
    ),
    layer: "RAP_BOOMBAP",
    genre: "boombap",
  },
  {
    re: new RegExp(
      `^rap-trap-(\\d+(?:\\.\\d+)?)${SOURCE_SUFFIX}\\.(wav|mp3)$`,
      "i",
    ),
    layer: "RAP_TRAP",
    genre: "trap",
  },
  {
    re: new RegExp(
      `^rap-drill-(\\d+(?:\\.\\d+)?)${SOURCE_SUFFIX}\\.(wav|mp3)$`,
      "i",
    ),
    layer: "RAP_DRILL",
    genre: "drill",
  },
];

export function parseExpectedBpmFromFilename(
  filename: string,
): number | null {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
  for (const p of PATTERNS) {
    const m = base.match(p.re);
    if (!m) continue;
    const bpm = Number(m[1]);
    if (!Number.isFinite(bpm) || bpm <= 0) return null;
    return Math.round(bpm);
  }
  return null;
}

export function parseFixtureFilename(
  filename: string,
  absolutePath = filename,
): FixtureMeta | null {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
  for (const p of PATTERNS) {
    const m = base.match(p.re);
    if (!m) continue;
    const bpm = Number(m[1]);
    const ext = (m[2] ?? "").toLowerCase();
    if (!Number.isFinite(bpm) || bpm <= 0) return null;
    const format = EXT_FORMAT[ext] ?? "OTHER";
    if (format === "OTHER") return null;
    return {
      file: base,
      absolutePath,
      layer: p.layer,
      genre: p.genre,
      format,
      expectedBpm: Math.round(bpm),
    };
  }
  return null;
}
