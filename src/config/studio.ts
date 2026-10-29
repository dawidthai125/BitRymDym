/**
 * P5 Studio config SSOT (OD-P5-07 soft project cap).
 */

/** Soft max Studio projects per authenticated user. */
export const STUDIO_MAX_PROJECTS_PER_USER = 25;

/** Client-side page size for /studio project list. */
export const STUDIO_PROJECT_LIST_PAGE_SIZE = 15;

export const STUDIO_TITLE_MAX_LENGTH = 120;
export const STUDIO_TRACK_NAME_MAX_LENGTH = 80;

/** Default new project timeline length (ms). */
export const STUDIO_DEFAULT_TIMELINE_LENGTH_MS = 60_000;
/** Max song length in Studio (timeline, render, master). New projects get exactly this timeline. */
export const STUDIO_MAX_SONG_MS = 240_000;

/**
 * Minimum Clip duration (integer ms) — mirrors DB check
 * `studio_clips_duration_chk` (duration_ms >= 1).
 */
export const STUDIO_CLIP_MIN_DURATION_MS = 1;

/** Default Project tempo. */
export const STUDIO_DEFAULT_TEMPO_BPM = 120;

export const STUDIO_TRACK_TYPES = [
  "VOCAL",
  "BEAT",
  "SAMPLE",
  "SCRATCH",
  "INSTRUMENT",
  "GUITAR",
  "FX",
  "BUS",
  "OTHER",
] as const;

export type StudioTrackType = (typeof STUDIO_TRACK_TYPES)[number];

/** Stage 0 — musical role of a track (DB: studio_tracks.track_role CHECK). */
export const STUDIO_TRACK_ROLES = [
  "lead_vocal",
  "adlib",
  "double",
  "backing",
  "beat",
  "instrument",
  "other",
] as const;

export type StudioTrackRole = (typeof STUDIO_TRACK_ROLES)[number];

export function isStudioTrackRole(value: unknown): value is StudioTrackRole {
  return (
    typeof value === "string" &&
    (STUDIO_TRACK_ROLES as readonly string[]).includes(value)
  );
}

/** Default role for a new track / recording (mirrors the DB insert trigger). */
export function defaultStudioTrackRole(trackType: string): StudioTrackRole {
  switch (trackType) {
    case "VOCAL":
      return "lead_vocal";
    case "BEAT":
      return "beat";
    case "INSTRUMENT":
    case "GUITAR":
      return "instrument";
    default:
      return "other";
  }
}

export const STUDIO_CLIP_SOURCE_KINDS = [
  "TAKE",
  "BEAT_REF",
  "ARTIFACT",
] as const;

export type StudioClipSourceKind = (typeof STUDIO_CLIP_SOURCE_KINDS)[number];

export const STUDIO_PROJECT_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
] as const;

export type StudioProjectStatus = (typeof STUDIO_PROJECT_STATUSES)[number];
