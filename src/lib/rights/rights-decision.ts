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
  summaryPl: string;
};

/** A short file cannot reach 20 s of overlap: then 80 % of its length is enough. */
export function catalogMinSeconds(durationSeconds: number | null): number {
  const full = AUTO_CHECK_THRESHOLDS.ownCatalogMinSeconds;
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return full;
  return Math.min(full, Math.max(4, durationSeconds * 0.8));
}

export function isHardCatalogHit(hit: CatalogHit, durationSeconds: number | null): boolean {
  return hit.score >= AUTO_CHECK_THRESHOLDS.ownCatalogHardScore && hit.matchedSeconds >= catalogMinSeconds(durationSeconds);
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
  if (input.ownBeatRejected) reasons.push("Bit w projekcie został odrzucony przy sprawdzaniu.");
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
    }
    const cat = f.catalog.find((h) => isHardCatalogHit(h, f.durationSeconds));
    if (cat) {
      const what = cat.source === "beat" ? "bitu z katalogu" : "sampla z katalogu";
      reasons.push(`${label[0]!.toUpperCase()}${label.slice(1)} pasuje do ${what}${cat.title ? ` „${cat.title}”` : ""}.`);
    }
  }
  if (input.files.length === 0) reasons.push("Brak plików do sprawdzenia.");
  const passed = reasons.length === 0;
  return {
    passed,
    reasons,
    summaryPl: passed
      ? "Sprawdzone: brak podobieństwa do cudzych nagrań."
      : `Utwór czeka na moderatora. ${reasons.slice(0, 4).join(" ")}`,
  };
}
