import { ANONYMIZED_PUBLIC_AUTHOR } from "@/lib/auth/display-name";

/** Shown when a platform beat has no producer name. */
export const PLATFORM_AUTHOR = "BitRymDym";

export function publicAuthorName(input: {
  ownership: "PLATFORM" | "USER";
  displayName?: string | null;
  producer?: string | null;
}): string {
  if (input.ownership === "PLATFORM") {
    return input.producer?.trim() || input.displayName?.trim() || PLATFORM_AUTHOR;
  }
  return input.displayName?.trim() || input.producer?.trim() || ANONYMIZED_PUBLIC_AUTHOR;
}

/** Public catalogue is the author's choice. Ranking and ratings use the same gate. */
export function isPubliclyListed(input: { published: boolean; listed: boolean }): boolean {
  return input.published && input.listed;
}

export function canRatePublic(input: { published: boolean; listed: boolean }): boolean {
  return isPubliclyListed(input);
}

/** Comments exist only on a public listing, and only while the author leaves them on. */
export function canCommentPublic(input: {
  published: boolean;
  listed: boolean;
  allowComments: boolean;
}): boolean {
  return isPubliclyListed(input) && input.allowComments;
}

export type CatalogSource = "brd" | "user";

/**
 * `?zrodlo=` on /sampel. Official BitRymDym samples are the default tab;
 * only an explicit `user` opens the user tab.
 */
export function parseCatalogSource(raw: string | string[] | null | undefined): CatalogSource {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "user" ? "user" : "brd";
}

/**
 * Catalog numbers (#NN) per sample id. The stored `sampleNumber` (DB identity, never moves)
 * wins. Only when no row has it (DB before migration 20261121170000) the page falls back
 * to the old creation-order count, so it still shows numbers.
 */
export function catalogSampleNumbers(
  samples: readonly { id: string; sampleNumber?: number | null; createdAt?: string | null }[],
): Map<string, number> {
  const stored = (n: number | null | undefined): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;
  if (samples.some((s) => stored(s.sampleNumber))) {
    return new Map(samples.filter((s) => stored(s.sampleNumber)).map((s) => [s.id, s.sampleNumber as number]));
  }
  const byAge = [...samples].sort(
    (a, b) =>
      (a.createdAt ? Date.parse(a.createdAt) : 0) - (b.createdAt ? Date.parse(b.createdAt) : 0) || a.id.localeCompare(b.id),
  );
  return new Map(byAge.map((s, index) => [s.id, index + 1]));
}
