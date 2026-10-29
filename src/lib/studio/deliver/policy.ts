/**
 * Stage 3 — Studio deliverables download policy (SSOT, enforced server-side
 * in /api/studio/projects/[id]/deliver; UI only mirrors it).
 * Owner rules 2026-10-29: guest nothing; Free 1 file / rolling 7 days
 * (mix/master/raw, MP3 128); Bronze MP3 128; Silver MP3 128+192;
 * Gold MP3 128/192/320 + WAV 24-bit; Project (zip of all tracks) shown to
 * everyone, enabled only in Gold. Everything requires an approved master.
 */

import type { PremiumTier } from "@/types/premium";

export const DELIVER_KINDS = ["mix", "master", "raw", "project"] as const;
export type DeliverKind = (typeof DELIVER_KINDS)[number];
export const DELIVER_FORMATS = ["MP3_128", "MP3_192", "MP3_320", "WAV_24", "ZIP"] as const;
export type DeliverFormat = (typeof DELIVER_FORMATS)[number];

export const isDeliverKind = (v: unknown): v is DeliverKind => typeof v === "string" && (DELIVER_KINDS as readonly string[]).includes(v);
export const isDeliverFormat = (v: unknown): v is DeliverFormat => typeof v === "string" && (DELIVER_FORMATS as readonly string[]).includes(v);

export const DELIVER_AUDIO_FORMATS_BY_TIER: Record<PremiumTier, readonly DeliverFormat[]> = {
  FREE: ["MP3_128"],
  BRONZE: ["MP3_128"],
  SILVER: ["MP3_128", "MP3_192"],
  GOLD: ["MP3_128", "MP3_192", "MP3_320", "WAV_24"],
};

/** null = unlimited (still logged in studio_download_usage). */
export const DELIVER_WEEKLY_LIMIT: Record<PremiumTier, number | null> = { FREE: 1, BRONZE: null, SILVER: null, GOLD: null };

export type DeliverDenyReason = "login" | "not_approved" | "tier_format" | "tier_project" | "bad_request";

export type DeliverDecision =
  | { allowed: true; weeklyLimit: number | null }
  | { allowed: false; reason: DeliverDenyReason };

export function decideDeliver(params: {
  tier: PremiumTier | null;
  kind: unknown;
  format: unknown;
  approved: boolean;
}): DeliverDecision {
  if (!params.tier) return { allowed: false, reason: "login" };
  if (!isDeliverKind(params.kind) || !isDeliverFormat(params.format)) return { allowed: false, reason: "bad_request" };
  if (!params.approved) return { allowed: false, reason: "not_approved" };
  if (params.kind === "project") {
    if (params.format !== "ZIP") return { allowed: false, reason: "bad_request" };
    if (params.tier !== "GOLD") return { allowed: false, reason: "tier_project" };
    return { allowed: true, weeklyLimit: DELIVER_WEEKLY_LIMIT.GOLD };
  }
  if (params.format === "ZIP") return { allowed: false, reason: "bad_request" };
  if (!DELIVER_AUDIO_FORMATS_BY_TIER[params.tier].includes(params.format)) return { allowed: false, reason: "tier_format" };
  return { allowed: true, weeklyLimit: DELIVER_WEEKLY_LIMIT[params.tier] };
}

/** Rows for the UI: every option is visible, `enabled` mirrors decideDeliver (minus quota). */
export function deliverOptions(tier: PremiumTier | null): { kind: DeliverKind; format: DeliverFormat; enabled: boolean }[] {
  const rows: { kind: DeliverKind; format: DeliverFormat; enabled: boolean }[] = [];
  for (const kind of ["mix", "master", "raw"] as const) {
    for (const format of ["MP3_128", "MP3_192", "MP3_320", "WAV_24"] as const) {
      rows.push({ kind, format, enabled: decideDeliver({ tier, kind, format, approved: true }).allowed });
    }
  }
  rows.push({ kind: "project", format: "ZIP", enabled: decideDeliver({ tier, kind: "project", format: "ZIP", approved: true }).allowed });
  return rows;
}

/** ffmpeg encode args per format (E3 worker). */
export const DELIVER_FFMPEG_ARGS: Record<Exclude<DeliverFormat, "ZIP">, string[]> = {
  MP3_128: ["-c:a", "libmp3lame", "-b:a", "128k"],
  MP3_192: ["-c:a", "libmp3lame", "-b:a", "192k"],
  MP3_320: ["-c:a", "libmp3lame", "-b:a", "320k"],
  WAV_24: ["-c:a", "pcm_s24le"],
};
