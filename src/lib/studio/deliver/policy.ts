/**
 * Stage 3 — Studio deliverables download policy (enforced server-side in
 * /api/studio/projects/[id]/deliver; UI only mirrors it).
 * Formats are NOT a second ladder: each Studio format maps onto a Premium
 * download quality and is allowed iff the plan's `downloads.qualities`
 * (`@/config/plan-policy`) contains it. Owner 2026-10-29: guest nothing; Free
 * nothing (the old 1 file / 7 days MP3 128 is gone — locked buttons + premium
 * nudge); Bronze MP3 128; Silver MP3 128/192; Gold MP3 128/192/320 + WAV 24-bit;
 * Project (zip of all tracks) shown to everyone, enabled where
 * `downloads.projectZip` (Gold). Everything requires an approved master.
 */

import { minimumTierForQuality, PLAN_POLICY, type PlanDownloadQuality } from "@/config/plan-policy";
import { PREMIUM_TIERS, type PremiumTier } from "@/types/premium";

export const DELIVER_KINDS = ["mix", "master", "raw", "project"] as const;
export type DeliverKind = (typeof DELIVER_KINDS)[number];
export const DELIVER_FORMATS = ["MP3_128", "MP3_192", "MP3_320", "WAV_24", "ZIP"] as const;
export type DeliverFormat = (typeof DELIVER_FORMATS)[number];

export const isDeliverKind = (v: unknown): v is DeliverKind => typeof v === "string" && (DELIVER_KINDS as readonly string[]).includes(v);
export const isDeliverFormat = (v: unknown): v is DeliverFormat => typeof v === "string" && (DELIVER_FORMATS as readonly string[]).includes(v);

export type DeliverAudioFormat = Exclude<DeliverFormat, "ZIP">;

/** Studio format → the Premium quality it is (WAV 24-bit/44.1 = WAV_PRO). */
export const DELIVER_FORMAT_QUALITY: Record<DeliverAudioFormat, PlanDownloadQuality> = {
  MP3_128: "MP3_128",
  MP3_192: "MP3_192",
  MP3_320: "MP3_320",
  WAV_24: "WAV_PRO",
};

const AUDIO_FORMATS = ["MP3_128", "MP3_192", "MP3_320", "WAV_24"] as const satisfies readonly DeliverAudioFormat[];

const audioFormatsFor = (tier: PremiumTier): readonly DeliverFormat[] =>
  AUDIO_FORMATS.filter((f) => PLAN_POLICY[tier].downloads.qualities.includes(DELIVER_FORMAT_QUALITY[f]));

export const DELIVER_AUDIO_FORMATS_BY_TIER: Record<PremiumTier, readonly DeliverFormat[]> = {
  FREE: audioFormatsFor("FREE"),
  BRONZE: audioFormatsFor("BRONZE"),
  SILVER: audioFormatsFor("SILVER"),
  GOLD: audioFormatsFor("GOLD"),
};

/** Lowest plan that unlocks a Studio format (lock labels). */
export function minimumTierForDeliverFormat(format: DeliverFormat): PremiumTier {
  if (format === "ZIP") return PREMIUM_TIERS.find((t) => PLAN_POLICY[t].downloads.projectZip) ?? "GOLD";
  return minimumTierForQuality(DELIVER_FORMAT_QUALITY[format]);
}

/**
 * null = unlimited (still logged in studio_download_usage). Paid plans have no weekly file cap.
 * Free watermark downloads use FREE_WATERMARK_WEEK_BACKSTOP; the 24 h cap is separate.
 */
export const DELIVER_WEEKLY_LIMIT: Record<PremiumTier, number | null> = { FREE: null, BRONZE: null, SILVER: null, GOLD: null };

/**
 * Owner 2026-11-12: Free may download an MP3 128 with the voice watermark (a mix with their own recording, never the
 * clean Bit). 3 per rolling 24 h. The switch stays OFF until the E3 worker that applies the watermark is deployed:
 * an old worker would encode a clean file. Set STUDIO_FREE_WATERMARK_DOWNLOAD=1 only after the worker update.
 */
export const FREE_WATERMARK_PER_DAY = 3;
/** Backstop on the rolling 7-day RPC counter (3 × 7); the 24 h cap is enforced in code. */
export const FREE_WATERMARK_WEEK_BACKSTOP = FREE_WATERMARK_PER_DAY * 7;
export const FREE_WATERMARK_KINDS = ["mix", "master"] as const satisfies readonly DeliverKind[];

export function freeWatermarkDownloadEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.STUDIO_FREE_WATERMARK_DOWNLOAD ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

export type DeliverDenyReason = "login" | "not_approved" | "tier_format" | "tier_project" | "bad_request";

export type DeliverDecision =
  | { allowed: true; weeklyLimit: number | null; watermark?: true }
  | { allowed: false; reason: DeliverDenyReason };

export function decideDeliver(params: {
  tier: PremiumTier | null;
  kind: unknown;
  format: unknown;
  approved: boolean;
  /** Test hook; default reads STUDIO_FREE_WATERMARK_DOWNLOAD. */
  freeWatermark?: boolean;
}): DeliverDecision {
  if (!params.tier) return { allowed: false, reason: "login" };
  if (!isDeliverKind(params.kind) || !isDeliverFormat(params.format)) return { allowed: false, reason: "bad_request" };
  if (!params.approved) return { allowed: false, reason: "not_approved" };
  if (params.kind === "project") {
    if (params.format !== "ZIP") return { allowed: false, reason: "bad_request" };
    if (!PLAN_POLICY[params.tier].downloads.projectZip) return { allowed: false, reason: "tier_project" };
    return { allowed: true, weeklyLimit: DELIVER_WEEKLY_LIMIT[params.tier] };
  }
  if (params.format === "ZIP") return { allowed: false, reason: "bad_request" };
  if (
    params.tier === "FREE" &&
    params.format === "MP3_128" &&
    (FREE_WATERMARK_KINDS as readonly string[]).includes(params.kind) &&
    (params.freeWatermark ?? freeWatermarkDownloadEnabled())
  ) {
    return { allowed: true, weeklyLimit: FREE_WATERMARK_WEEK_BACKSTOP, watermark: true };
  }
  if (!DELIVER_AUDIO_FORMATS_BY_TIER[params.tier].includes(params.format)) return { allowed: false, reason: "tier_format" };
  return { allowed: true, weeklyLimit: DELIVER_WEEKLY_LIMIT[params.tier] };
}

/** Rows for the UI: every option is visible, `enabled` mirrors decideDeliver (minus quota). */
export function deliverOptions(tier: PremiumTier | null): { kind: DeliverKind; format: DeliverFormat; enabled: boolean; watermark?: boolean }[] {
  const rows: { kind: DeliverKind; format: DeliverFormat; enabled: boolean; watermark?: boolean }[] = [];
  for (const kind of ["mix", "master", "raw"] as const) {
    for (const format of ["MP3_128", "MP3_192", "MP3_320", "WAV_24"] as const) {
      const d = decideDeliver({ tier, kind, format, approved: true });
      rows.push({ kind, format, enabled: d.allowed, ...(d.allowed && d.watermark ? { watermark: true } : {}) });
    }
  }
  rows.push({ kind: "project", format: "ZIP", enabled: decideDeliver({ tier, kind: "project", format: "ZIP", approved: true }).allowed });
  return rows;
}

/** ffmpeg encode args per format (E3 worker). */
export const DELIVER_FFMPEG_ARGS: Record<DeliverAudioFormat, string[]> = {
  MP3_128: ["-c:a", "libmp3lame", "-b:a", "128k"],
  MP3_192: ["-c:a", "libmp3lame", "-b:a", "192k"],
  MP3_320: ["-c:a", "libmp3lame", "-b:a", "320k"],
  WAV_24: ["-c:a", "pcm_s24le"],
};
