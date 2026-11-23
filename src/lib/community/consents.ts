/**
 * One set of author choices for a beat, a sample and a finished track (owner decision 2026-11-23):
 * catalogue, ratings, comments, ranking. Pure. The database keeps the same rule as a constraint.
 *  - A ranking entry turns on ratings and comments.
 *  - Turning ratings or comments off leaves the ranking.
 *  - Outside the catalogue there is no ranking.
 */
export type ListingConsents = {
  listed: boolean;
  allowRatings: boolean;
  allowComments: boolean;
  inRankings: boolean;
};

export type ConsentPatch = Partial<ListingConsents>;

export const CONSENT_KEYS = ["listed", "allowRatings", "allowComments", "inRankings"] as const;

/** A new user work: in the catalogue once it is approved, everything else is the author's opt-in. */
export const DEFAULT_USER_CONSENTS: ListingConsents = {
  listed: true,
  allowRatings: false,
  allowComments: false,
  inRankings: false,
};

export function applyConsentPatch(current: ListingConsents, patch: ConsentPatch): ListingConsents {
  const next: ListingConsents = { ...current };
  for (const key of CONSENT_KEYS) {
    const value = patch[key];
    if (typeof value === "boolean") next[key] = value;
  }
  if (!next.listed) return { ...next, inRankings: false };
  if (patch.inRankings === true) return { ...next, allowRatings: true, allowComments: true };
  if (next.inRankings && !(next.allowRatings && next.allowComments)) next.inRankings = false;
  return next;
}

/** Untrusted input → patch. Unknown keys are ignored; a non-boolean value rejects the whole input. */
export function parseConsentPatch(input: unknown): ConsentPatch | null {
  if (input == null || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const patch: ConsentPatch = {};
  for (const key of CONSENT_KEYS) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== "boolean") return null;
    patch[key] = raw[key] as boolean;
  }
  return patch;
}

type ConsentRow = { allow_ratings?: boolean | null; allow_comments?: boolean | null; in_rankings?: boolean | null };

export function consentsFromRow(row: ConsentRow, listed: boolean): ListingConsents {
  return {
    listed,
    allowRatings: row.allow_ratings === true,
    allowComments: row.allow_comments === true,
    inRankings: row.in_rankings === true,
  };
}

export function consentColumns(consents: ListingConsents) {
  return {
    allow_ratings: consents.allowRatings,
    allow_comments: consents.allowComments,
    in_rankings: consents.inRankings,
  };
}
