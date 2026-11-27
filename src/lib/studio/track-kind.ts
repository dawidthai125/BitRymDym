/**
 * What a new vocal track is for: Wokal, Podbicie or Adlib. The kind sets the track role and the
 * first part of the name; the number is the next one after the highest taken, so "Wokal 1, Wokal 2…"
 * stay in order. An unnumbered "Wokal" (the first track of a project) counts as number 1.
 */
import type { StudioTrackRole } from "@/config/studio";

export const STUDIO_NEW_TRACK_KINDS = ["vocal", "double", "adlib"] as const;
export type StudioNewTrackKind = (typeof STUDIO_NEW_TRACK_KINDS)[number];

export const STUDIO_NEW_TRACK_ROLE: Record<StudioNewTrackKind, StudioTrackRole> = {
  vocal: "lead_vocal",
  double: "double",
  adlib: "adlib",
};

export const STUDIO_TRACK_NAME_MAX = 40;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function nextKindTrackName(base: string, existingNames: readonly string[]): string {
  const root = base.trim() || "Wokal";
  const pattern = new RegExp(`^${escape(root)}\\s*(\\d+)?$`, "i");
  let taken = 0;
  for (const name of existingNames) {
    const found = pattern.exec(name.trim());
    if (found) taken = Math.max(taken, found[1] ? Number(found[1]) : 1);
  }
  return `${root} ${taken + 1}`;
}

/** Spaces squeezed, at most 40 characters; empty gives the suggested name. */
export function cleanTrackName(text: string, fallback: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, STUDIO_TRACK_NAME_MAX).trim();
  return cleaned || fallback;
}
