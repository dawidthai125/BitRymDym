/**
 * Upload screen and rights statement (owner order 2026-11-26). Pure: no IO.
 *
 * 1) Rights statement: "Importuj wokal", stems and "Sam mastering" need the statement on the SERVER.
 *    The version names the exact statement texts (messages: studio.studioRecordingPanel.importPrawa,
 *    studio.stemImport.prawa, mastering.prawa). Change a text → bump the version (a test pins the texts).
 * 2) Blocked audio: every new upload is compared with files taken down from the catalogue
 *    (blocked_audio_fingerprints): SHA-256 at finalize, Chromaprint on the E3 upload-screen worker.
 * 3) Catalogue beats: an upload may not be one of our catalogue beats (except the project's own beat for a
 *    stem and the uploader's own beats). Exact copy at finalize, strict acoustic match on the worker.
 * 4) File type from the content (magic bytes), not from the declared type or the file name.
 */
import { UPLOAD_RIGHTS_STATEMENT_VERSION } from "@/config/rights-statement";
import { catalogMinSeconds, RIGHTS_LONG_MATCH, type CatalogHit } from "@/lib/rights/rights-decision";
import { AUTO_CHECK_THRESHOLDS } from "@/lib/beats/auto-check/decision";


export { UPLOAD_RIGHTS_STATEMENT_VERSION };

export type UploadRightsKind = "vocal_import" | "stem" | "master_only";

/** Where a take upload comes from. Only "import" needs the statement; mic and the PC recorder record live. */
export type TakeUploadSource = "import" | "mic" | "recorder";

export function parseTakeUploadSource(raw: unknown, legacyRightsConfirmed: unknown): TakeUploadSource {
  if (raw === "import" || raw === "mic" || raw === "recorder") return raw;
  // Clients from before 2026-11-26 sent only rightsConfirmed for an import.
  return legacyRightsConfirmed === true ? "import" : "mic";
}

/** The statement the client sent is the current one. Anything else (missing, old text, junk) is refused. */
export function isCurrentRightsStatement(version: unknown): boolean {
  return version === UPLOAD_RIGHTS_STATEMENT_VERSION;
}

export class RightsStatementRequiredError extends Error {
  readonly code = "RIGHTS_REQUIRED" as const;
  constructor() {
    super("Potwierdź oświadczenie o prawach do pliku. Jeśli nie widzisz okna, odśwież stronę.");
  }
}

export type UploadBlockCode = "BLOCKED_AUDIO" | "CATALOG_BEAT" | "SCREENING_PENDING";

export const UPLOAD_BLOCK_MESSAGE: Record<UploadBlockCode, string> = {
  BLOCKED_AUDIO: "Tego pliku nie można wgrać: został zdjęty z BitRymDym po zgłoszeniu naruszenia praw.",
  CATALOG_BEAT: "To jest bit z katalogu BitRymDym. Nie można go wgrać jako własnego pliku.",
  SCREENING_PENDING: "Sprawdzamy wgrany plik. Spróbuj ponownie za chwilę.",
};

export class UploadBlockedError extends Error {
  constructor(readonly code: UploadBlockCode) {
    super(UPLOAD_BLOCK_MESSAGE[code]);
  }
}

/** match_kind from check_upload_sha256 / the worker → user-facing code. */
export function blockCodeForMatch(matchKind: string): UploadBlockCode {
  return matchKind.startsWith("catalog") ? "CATALOG_BEAT" : "BLOCKED_AUDIO";
}

// ------------------------------------------------------------------ acoustic thresholds

/**
 * Taken-down file vs a new upload (Chromaprint raw, compareFingerprints: score = share of matching
 * frames in the aligned overlap, matchedSeconds = matching frames in seconds, best offset).
 * Blocked when EITHER
 *  - strict: score ≥ 0.85 and ≥ min(20 s, 80 % of the shorter file, at least 4 s) matching — an exact
 *    re-encode (MP3 / other bitrate / −3 dB / cut by a few seconds) lands at 0.9–1.0 on a whole song;
 *  - long: score ≥ 0.5 and ≥ 30 s matching on a file of ≥ 20 s — the same recording mastered, under
 *    vocals or heavily re-encoded (the 2026-11-26 incident scored 0.82 on 121 s).
 * Trimming moves the offset only (compareFingerprints aligns), so a cut file keeps its score.
 * Volume changes do not change Chromaprint (it is level independent), format/bitrate barely do.
 */
export const BLOCKED_MATCH = {
  strictScore: AUTO_CHECK_THRESHOLDS.ownCatalogHardScore,
  longScore: RIGHTS_LONG_MATCH.minScore,
  longSeconds: RIGHTS_LONG_MATCH.minSeconds,
  longMinFileSeconds: RIGHTS_LONG_MATCH.minFileSeconds,
} as const;

export type FingerprintScore = { score: number; matchedSeconds: number };

/** Shorter of the two files decides the strict minimum overlap (a short blocked loop can still match). */
export function isBlockedAudioMatch(m: FingerprintScore, uploadSeconds: number | null, blockedSeconds: number | null): boolean {
  const shorter = [uploadSeconds, blockedSeconds].filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0);
  const seconds = shorter.length ? Math.min(...shorter) : null;
  if (m.score >= BLOCKED_MATCH.strictScore && m.matchedSeconds >= catalogMinSeconds(seconds)) return true;
  return (
    seconds !== null &&
    seconds >= BLOCKED_MATCH.longMinFileSeconds &&
    m.score >= BLOCKED_MATCH.longScore &&
    m.matchedSeconds >= BLOCKED_MATCH.longSeconds
  );
}

/**
 * Catalogue beat vs an upload: strict rule only. The project's beat is skipped by the caller (it bleeds
 * into every vocal take), so what is left would be someone else's beat uploaded as a "vocal" or a stem.
 */
export function isCatalogBeatUpload(hit: Pick<CatalogHit, "score" | "matchedSeconds">, uploadSeconds: number | null): boolean {
  return hit.score >= AUTO_CHECK_THRESHOLDS.ownCatalogHardScore && hit.matchedSeconds >= catalogMinSeconds(uploadSeconds);
}

export type ScreenVerdict =
  | { outcome: "passed" }
  | { outcome: "blocked"; matchKind: "blocked_fingerprint" | "catalog_fingerprint"; blockedId: string | null; catalogBeatId: string | null; score: number; matchedSeconds: number };

export function decideUploadScreen(p: {
  uploadSeconds: number | null;
  blocked: Array<FingerprintScore & { id: string; durationSeconds: number | null }>;
  catalog: Array<FingerprintScore & { beatId: string }>;
}): ScreenVerdict {
  const b = p.blocked
    .filter((x) => isBlockedAudioMatch(x, p.uploadSeconds, x.durationSeconds))
    .sort((x, y) => y.score - x.score)[0];
  if (b) return { outcome: "blocked", matchKind: "blocked_fingerprint", blockedId: b.id, catalogBeatId: null, score: b.score, matchedSeconds: b.matchedSeconds };
  const c = p.catalog.filter((x) => isCatalogBeatUpload(x, p.uploadSeconds)).sort((x, y) => y.score - x.score)[0];
  if (c) return { outcome: "blocked", matchKind: "catalog_fingerprint", blockedId: null, catalogBeatId: c.beatId, score: c.score, matchedSeconds: c.matchedSeconds };
  return { outcome: "passed" };
}

// ------------------------------------------------------------------ content sniffing

export type SniffedContainer = "webm" | "ogg" | "wav" | "mp3" | "flac" | "mp4" | "aiff" | "aac";

/** Container from the first bytes. null = not a known audio container. */
export function sniffAudioContainer(b: Uint8Array): SniffedContainer | null {
  const at = (i: number, s: string) => s.split("").every((ch, k) => b[i + k] === ch.charCodeAt(0));
  if (b.length < 12) return null;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  if (at(0, "OggS")) return "ogg";
  if (at(0, "RIFF") && at(8, "WAVE")) return "wav";
  if (at(0, "FORM") && (at(8, "AIFF") || at(8, "AIFC"))) return "aiff";
  if (at(0, "fLaC")) return "flac";
  if (at(4, "ftyp")) return "mp4";
  if (at(0, "ID3")) {
    // ID3v2 tag (syncsafe size) in front of the audio: an MP3 usually, sometimes a FLAC or AAC file.
    const size = 10 + ((b[6]! & 0x7f) << 21 | (b[7]! & 0x7f) << 14 | (b[8]! & 0x7f) << 7 | (b[9]! & 0x7f));
    const rest = size + 12 <= b.length ? sniffAudioContainer(b.subarray(size)) : null;
    return rest === "flac" || rest === "aac" ? rest : "mp3";
  }
  // Raw AAC (ADTS): 12-bit sync, layer 00.
  if (b[0] === 0xff && (b[1]! & 0xf6) === 0xf0) return "aac";
  // MPEG audio frame sync (11 bits) with a valid layer.
  if (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0 && (b[1]! & 0x06) !== 0) return "mp3";
  return null;
}

const CONTAINERS_FOR_TYPE: Array<[RegExp, SniffedContainer[]]> = [
  [/^audio\/webm/, ["webm"]],
  [/^audio\/ogg/, ["ogg"]],
  [/^audio\/(wav|x-wav|wave|vnd\.wave)/, ["wav"]],
  [/^audio\/(mpeg|mp3)/, ["mp3"]],
  [/^audio\/(flac|x-flac)/, ["flac"]],
  [/^audio\/(mp4|x-m4a)/, ["mp4"]],
  [/^audio\/aac/, ["aac", "mp4"]],
  [/^audio\/(aiff|x-aiff)/, ["aiff"]],
];

/** The bytes really are the declared kind of audio. Unknown declared types are refused. */
export function contentMatchesDeclaredType(bytes: Uint8Array, declaredType: string): boolean {
  const sniffed = sniffAudioContainer(bytes);
  if (!sniffed) return false;
  const t = declaredType.toLowerCase().split(";")[0]!.trim();
  const row = CONTAINERS_FOR_TYPE.find(([re]) => re.test(t));
  return !!row && row[1].includes(sniffed);
}
