/**
 * Rights check of a catalogue work (owner decision 2026-11-26). Pure: no IO.
 * Every uploaded file of the project (imported vocals, stems, "Sam mastering" upload,
 * the owner's own beat) and the final master are fingerprinted on the worker host.
 * A file that matches one of our beats (other than the project's own beat) or a
 * known recording in AcoustID holds the work for a moderator. Errors hold too:
 * nothing goes live unchecked.
 */
import { AUTO_CHECK_THRESHOLDS } from "@/lib/beats/auto-check/decision";

export type RightsFileKind = "master" | "take" | "stem" | "own_beat";

export type CatalogHit = {
  source: "beat" | "sample";
  id: string;
  title: string | null;
  score: number;
  matchedSeconds: number;
};

export type ExternalHit = { score: number; title: string | null; artist: string | null; url: string | null };

export type RightsFileResult = {
  kind: RightsFileKind;
  ref: string;
  durationSeconds: number | null;
  catalog: CatalogHit[];
  external: ExternalHit[];
  /** AcoustID could not answer (timeout, http error). Not configured = null. */
  externalError: string | null;
  error: string | null;
};

export type RightsVerdict = {
  passed: boolean;
  reasons: string[];
  /** Real matches only (not technical errors): they keep the project with a moderator on later versions. */
  findings: string[];
  summaryPl: string;
};

/** A short file cannot reach 20 s of overlap: then 80 % of its length is enough. */
export function catalogMinSeconds(durationSeconds: number | null): number {
  const full = AUTO_CHECK_THRESHOLDS.ownCatalogMinSeconds;
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return full;
  return Math.min(full, Math.max(4, durationSeconds * 0.8));
}

/** Strict match (same bar as the beat upload filter). Also used for the staff hint on samples in review. */
export function isHardCatalogHit(hit: CatalogHit, durationSeconds: number | null): boolean {
  return hit.score >= AUTO_CHECK_THRESHOLDS.ownCatalogHardScore && hit.matchedSeconds >= catalogMinSeconds(durationSeconds);
}

/**
 * Long match (rights check only, owner incident 2026-11-26): a beat buried under vocals, mastered and
 * sent as a 128 kbps MP3 scores ~0.8 (score = matched share of the overlap), below the strict 0.85,
 * yet matches for minutes. Such a file holds the work for a moderator; it does not reject anything.
 * - minFileSeconds: the worker loops a file Chromaprint cannot read to 12 s (SHORT_LOOP_SECONDS) and then
 *   reports the looped length. A looped one-shot repeats one pattern and can align with any beat that
 *   uses it, so files under 20 s keep the strict rule only. (Below 20 s the rule could add little
 *   anyway: matched ≥ 80 % of the file already forces score ≥ 0.8.)
 */
export const RIGHTS_LONG_MATCH = {
  minScore: 0.5,
  minSeconds: 30,
  minFileSeconds: 20,
} as const;

export function isLongCatalogHit(hit: CatalogHit, durationSeconds: number | null): boolean {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds < RIGHTS_LONG_MATCH.minFileSeconds) return false;
  // At least 30 s of real overlap (catalogMinSeconds tops out at 20 s), so a shared short loop is not enough.
  const minSeconds = Math.max(RIGHTS_LONG_MATCH.minSeconds, catalogMinSeconds(durationSeconds));
  return hit.score >= RIGHTS_LONG_MATCH.minScore && hit.matchedSeconds >= minSeconds;
}

/** A catalogue hit that holds a work for the moderator: strict or long. */
export function isWorkCatalogHit(hit: CatalogHit, durationSeconds: number | null): boolean {
  return isHardCatalogHit(hit, durationSeconds) || isLongCatalogHit(hit, durationSeconds);
}

/**
 * Catalogue beats that are the same recording as the project's own beat (owner check 2026-11-26: a
 * "(remix)" entry matched its original at score 1.0 over 105 s). The song may use that audio, so a
 * match with such a copy is a match with the project's beat and must not hold the work. Measured on
 * the beats' own fingerprints with the strict rule and the beat's full length.
 */
export function sameAudioBeatIds(
  projectBeat: { id: string; fingerprint: number[]; durationSeconds: number | null },
  refs: ReadonlyArray<{ source: "beat" | "sample"; id: string; fingerprint: number[] }>,
  compare: (a: number[], b: number[]) => { score: number; matchedSeconds: number },
): string[] {
  const out: string[] = [];
  for (const ref of refs) {
    if (ref.source !== "beat" || ref.id === projectBeat.id) continue;
    const m = compare(projectBeat.fingerprint, ref.fingerprint);
    const hit: CatalogHit = { source: "beat", id: ref.id, title: null, score: m.score, matchedSeconds: m.matchedSeconds };
    if (isHardCatalogHit(hit, projectBeat.durationSeconds)) out.push(ref.id);
  }
  return out;
}

export function isHardExternalHit(hit: ExternalHit): boolean {
  return hit.score >= AUTO_CHECK_THRESHOLDS.externalHardScore;
}

const KIND_PL: Record<RightsFileKind, string> = {
  master: "gotowy utwór",
  take: "wgrane nagranie",
  stem: "wgrana ścieżka",
  own_beat: "Twój bit",
};

export function decideWorkRights(input: {
  files: RightsFileResult[];
  /** The owner's own beat was rejected by the beat filter or by a moderator. */
  ownBeatRejected?: boolean;
  /** More files than the worker checks in one run: never pass unchecked files. */
  truncated?: boolean;
}): RightsVerdict {
  const reasons: string[] = [];
  const findings: string[] = [];
  if (input.ownBeatRejected) {
    reasons.push("Bit w projekcie został odrzucony przy sprawdzaniu.");
    findings.push(reasons[reasons.length - 1]!);
  }
  if (input.truncated) reasons.push("Projekt ma za dużo wgranych plików, żeby sprawdzić je automatycznie.");
  for (const f of input.files) {
    const label = KIND_PL[f.kind];
    if (f.error) {
      reasons.push(`Nie udało się sprawdzić pliku (${label}).`);
      continue;
    }
    if (f.externalError) reasons.push(`Baza znanych nagrań nie odpowiedziała (${label}).`);
    const ext = f.external.find(isHardExternalHit);
    if (ext) {
      const name = [ext.artist, ext.title].filter(Boolean).join(" – ");
      reasons.push(`${label[0]!.toUpperCase()}${label.slice(1)} pasuje do znanego nagrania${name ? `: ${name}` : ""}.`);
      findings.push(reasons[reasons.length - 1]!);
    }
    const cat = f.catalog.find((h) => isWorkCatalogHit(h, f.durationSeconds));
    if (cat) {
      const what = cat.source === "beat" ? "bitu z katalogu" : "sampla z katalogu";
      reasons.push(`${label[0]!.toUpperCase()}${label.slice(1)} pasuje do ${what}${cat.title ? ` „${cat.title}”` : ""}.`);
      findings.push(reasons[reasons.length - 1]!);
    }
  }
  if (input.files.length === 0) reasons.push("Brak plików do sprawdzenia.");
  const passed = reasons.length === 0;
  return {
    passed,
    reasons,
    findings,
    summaryPl: passed
      ? "Sprawdzone: brak podobieństwa do cudzych nagrań."
      : `Utwór czeka na moderatora. ${reasons.slice(0, 4).join(" ")}`,
  };
}
