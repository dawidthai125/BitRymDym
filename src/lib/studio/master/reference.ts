/**
 * Reference mastering — pure helpers shared by the API, the E3 worker and the UI.
 *
 * Storage (private `audio-artifacts` bucket, keys carry only opaque uuids):
 *   studio-reference/{owner}/{project}/{referenceId}/ref.{mp3|wav}        (≤ 40 MiB)
 *   studio-reference/{owner}/{project}/{referenceId}/ref.{ext}.pNNN       (larger WAVs, byte parts)
 * The file is deleted right after the master job that used it and at the latest
 * REFERENCE_TTL_HOURS after upload (E3 sweep). Account deletion purges the prefix.
 */
import { partCount } from "./parts";
import { REFERENCE_FORMATS, REFERENCE_MAX_BYTES, REFERENCE_MAX_SECONDS, REFERENCE_MIN_SECONDS, type ReferenceFormat } from "./targets";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const STUDIO_REFERENCE_ROOT = "studio-reference";

export function referenceObjectKey(ownerId: string, projectId: string, referenceId: string, format: ReferenceFormat): string {
  for (const id of [ownerId, projectId, referenceId]) if (!UUID.test(id)) throw new Error("bad_id");
  if (!(REFERENCE_FORMATS as readonly string[]).includes(format)) throw new Error("bad_format");
  return `${STUDIO_REFERENCE_ROOT}/${ownerId}/${projectId}/${referenceId}/ref.${format}`;
}

export const REFERENCE_CONTENT_TYPE: Record<ReferenceFormat, string> = { mp3: "audio/mpeg", wav: "audio/wav" };

export type ReferenceUploadRequest = { fileName: string; format: ReferenceFormat; byteSize: number; durationMs: number; parts: number };
export type ReferenceUploadError = "bad_format" | "too_big" | "too_long" | "too_short" | "bad_request";

/** File name → format by extension or MIME type (MP3 / WAV only). */
export function referenceFormatOf(fileName: string, mime?: string | null): ReferenceFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase();
  if (ext === "mp3") return "mp3";
  if (ext === "wav" || ext === "wave") return "wav";
  const m = (mime ?? "").toLowerCase();
  if (m === "audio/mpeg" || m === "audio/mp3") return "mp3";
  if (m === "audio/wav" || m === "audio/x-wav" || m === "audio/wave" || m === "audio/vnd.wave") return "wav";
  return null;
}

/** Same check in the browser (before upload) and on the server (prepare). Duration comes from the browser decode; E3 re-checks the real length. */
export function validateReferenceUpload(raw: { fileName?: unknown; mime?: unknown; byteSize?: unknown; durationMs?: unknown }): { ok: true; value: ReferenceUploadRequest } | { ok: false; error: ReferenceUploadError } {
  const fileName = typeof raw.fileName === "string" ? raw.fileName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(-120) : "";
  const byteSize = Number(raw.byteSize);
  const durationMs = Number(raw.durationMs);
  if (!fileName || !Number.isFinite(byteSize) || !Number.isFinite(durationMs)) return { ok: false, error: "bad_request" };
  const format = referenceFormatOf(fileName, typeof raw.mime === "string" ? raw.mime : null);
  if (!format) return { ok: false, error: "bad_format" };
  if (byteSize <= 0 || byteSize > REFERENCE_MAX_BYTES) return { ok: false, error: "too_big" };
  if (durationMs > REFERENCE_MAX_SECONDS * 1000) return { ok: false, error: "too_long" };
  if (durationMs < REFERENCE_MIN_SECONDS * 1000) return { ok: false, error: "too_short" };
  return { ok: true, value: { fileName, format, byteSize: Math.round(byteSize), durationMs: Math.round(durationMs), parts: partCount(byteSize) } };
}

/** What the E3 engine reports back about the match (metrics.after.reference). */
export type ReferenceMatchReport = {
  intensity: number;
  reference: { lufs: number; sideToMid: number; durationS: number };
  /** Matching EQ actually applied per band (dB, after smoothing, caps and intensity). */
  eqDb: Record<"sub" | "bass" | "lowmid" | "mid" | "high" | "air", number>;
  loudness: { goalLufs: number; fromTargetLufs: number };
  width: { factor: number; mixSideToMid: number; refSideToMid: number };
};

export function isReferenceMatchReport(v: unknown): v is ReferenceMatchReport {
  const r = v as ReferenceMatchReport | null;
  return !!r && typeof r === "object" && typeof r.intensity === "number" && !!r.eqDb && typeof r.eqDb === "object" && !!r.loudness && !!r.width && !!r.reference;
}

export type ReferenceExplanationLine =
  | { key: "eqBoost" | "eqCut"; band: keyof ReferenceMatchReport["eqDb"]; db: number }
  | { key: "eqFlat" }
  | { key: "louder" | "quieter" | "sameLoudness"; lufs: number; refLufs: number }
  | { key: "wider" | "narrower" | "sameWidth"; pct: number }
  | { key: "intensity"; pct: number };

/**
 * BITEK (first person) — what the engine matched, biggest moves first.
 * Returns message keys + numbers; the UI renders them via next-intl
 * (studio.masterStep.referencja.bitek.*).
 */
export function explainReferenceMatch(r: ReferenceMatchReport): ReferenceExplanationLine[] {
  const lines: ReferenceExplanationLine[] = [];
  const bands = (Object.entries(r.eqDb) as [keyof ReferenceMatchReport["eqDb"], number][])
    .filter(([, db]) => Math.abs(db) >= 0.5)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3);
  if (!bands.length) lines.push({ key: "eqFlat" });
  for (const [band, db] of bands) lines.push({ key: db > 0 ? "eqBoost" : "eqCut", band, db: Math.round(Math.abs(db) * 10) / 10 });
  const dl = r.loudness.goalLufs - r.loudness.fromTargetLufs;
  const lufs = Math.round(r.loudness.goalLufs * 10) / 10;
  const refLufs = Math.round(r.reference.lufs * 10) / 10;
  lines.push({ key: Math.abs(dl) < 0.3 ? "sameLoudness" : dl > 0 ? "louder" : "quieter", lufs, refLufs });
  const pct = Math.round((r.width.factor - 1) * 100);
  lines.push({ key: Math.abs(pct) < 3 ? "sameWidth" : pct > 0 ? "wider" : "narrower", pct: Math.abs(pct) });
  lines.push({ key: "intensity", pct: Math.round(r.intensity) });
  return lines;
}
