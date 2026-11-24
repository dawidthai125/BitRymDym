/**
 * What a creator lets others see. Pure. Every switch is off until the creator turns it on; a value
 * whose switch is off never leaves the server.
 */
import { CREATOR_SERVICES, normalizeCreatorLink, type CreatorLinks, type CreatorService } from "@/lib/creators/creator-links";

export const SHARE_KEYS = [
  "links",
  "trackCount",
  "recordingCount",
  "beats",
  "samples",
  "works",
  "rankings",
  "experience",
  "joined",
] as const;
export type ShareKey = (typeof SHARE_KEYS)[number];
export type ShareFlags = Record<ShareKey, boolean>;

export const SHARE_COLUMN = {
  links: "show_links",
  trackCount: "show_track_count",
  recordingCount: "show_recording_count",
  beats: "show_beats",
  samples: "show_samples",
  works: "show_works",
  rankings: "show_rankings",
  experience: "show_experience",
  joined: "show_joined",
} as const satisfies Record<ShareKey, string>;

export const NO_SHARES: ShareFlags = {
  links: false,
  trackCount: false,
  recordingCount: false,
  beats: false,
  samples: false,
  works: false,
  rankings: false,
  experience: false,
  joined: false,
};

export const PROFILE_COLUMNS = [
  "owner_id",
  "public_id",
  "enabled",
  "blocked",
  ...CREATOR_SERVICES.map((service) => `link_${service}`),
  ...Object.values(SHARE_COLUMN),
].join(", ");

export type ProfileRow = Record<string, unknown>;

export type ProfileSettings = {
  publicId: string;
  enabled: boolean;
  blocked: boolean;
  links: CreatorLinks;
  share: ShareFlags;
};

/** Stored row → settings. Links are checked again: a value that is not a known profile address is dropped. */
export function settingsFromRow(row: ProfileRow): ProfileSettings {
  const links: CreatorLinks = {};
  for (const service of CREATOR_SERVICES) {
    const result = normalizeCreatorLink(service, row[`link_${service}`]);
    if (result.ok && result.value) links[service] = result.value;
  }
  const share = { ...NO_SHARES };
  for (const key of SHARE_KEYS) share[key] = row[SHARE_COLUMN[key]] === true;
  return {
    publicId: String(row.public_id ?? ""),
    enabled: row.enabled === true,
    blocked: row.blocked === true,
    links,
    share,
  };
}

export function isProfileLive(settings: Pick<ProfileSettings, "enabled" | "blocked">): boolean {
  return settings.enabled && !settings.blocked;
}

/** Untrusted switches → flags. Only `true` turns one on; unknown keys are ignored. */
export function parseShareFlags(input: unknown): ShareFlags {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const flags = { ...NO_SHARES };
  for (const key of SHARE_KEYS) flags[key] = raw[key] === true;
  return flags;
}

export function settingsColumns(input: { enabled: boolean; links: Record<CreatorService, string | null>; share: ShareFlags }) {
  const columns: Record<string, string | boolean | null> = { enabled: input.enabled };
  for (const service of CREATOR_SERVICES) columns[`link_${service}`] = input.links[service];
  for (const key of SHARE_KEYS) columns[SHARE_COLUMN[key]] = input.share[key];
  return columns;
}

export type CreatorPlace = {
  kind: "beat" | "sample" | "work";
  period: "week" | "month" | "all";
  place: number;
  targetId: string;
  title: string;
};

export type CreatorWorkCard = { id: string; title: string; clipSeconds: number | null };

/** Everything that may be shown. Loaded per switch; `filterFacts` is the last gate. */
export type CreatorFacts<Beat = unknown, Sample = unknown> = {
  trackCount: number | null;
  recordingCount: number | null;
  beats: { total: number; items: Beat[] } | null;
  samples: { total: number; items: Sample[] } | null;
  works: { total: number; items: CreatorWorkCard[] } | null;
  places: CreatorPlace[] | null;
};

export const NO_FACTS: CreatorFacts<never, never> = {
  trackCount: null,
  recordingCount: null,
  beats: null,
  samples: null,
  works: null,
  places: null,
};

export function filterFacts<B, S>(facts: CreatorFacts<B, S>, share: ShareFlags): CreatorFacts<B, S> {
  return {
    trackCount: share.trackCount ? facts.trackCount : null,
    recordingCount: share.recordingCount ? facts.recordingCount : null,
    beats: share.beats ? facts.beats : null,
    samples: share.samples ? facts.samples : null,
    works: share.works ? facts.works : null,
    places: share.rankings ? facts.places : null,
  };
}

/** A page with no public beat, sample or track stays out of search engines. */
export function hasPublicItem(facts: CreatorFacts): boolean {
  return [facts.beats, facts.samples, facts.works].some((group) => (group?.items.length ?? 0) > 0);
}
