/**
 * Plan policy SSOT (Owner decisions 2026-10-29, t45s320; 2026-10-30: Gold
 * retention 45 days, Bronze 2 recording tracks per project — Bit not counted).
 *
 * One table for everything a plan decides: price, recording, Studio size,
 * mastering quota, downloads, retention and add-ons. Every runtime module
 * (premium-tiers, recording sample policy, premium-export-policy, Studio
 * deliver policy, master quota, project limit) derives its numbers from here
 * and the server enforces them — the UI only mirrors.
 *
 * Payments: one-off checkout. PayU is the default provider. Przelewy24 is
 * used only when PayU env is absent. No card on file. Buy buttons stay hidden
 * until PLAN_PAYMENTS_AVAILABLE is on and that provider's env is set. Prices
 * below are the gross PLN amounts the server charges — the client never
 * supplies an amount.
 */

import type { PremiumTier } from "@/types/premium";

export type PlanActor = "GUEST" | PremiumTier;

export type ReferenceMasteringAccess = "none" | "addon" | "included";

/** Download qualities (finished RAW/MIX/MASTER files). Order = ladder order. */
export const PLAN_DOWNLOAD_QUALITIES = [
  "MP3_128",
  "MP3_192",
  "MP3_256",
  "MP3_320",
  "WAV_COMPAT",
  "WAV_PRO",
  "WAV_MASTER",
] as const;
export type PlanDownloadQuality = (typeof PLAN_DOWNLOAD_QUALITIES)[number];

export type PlanPrice = {
  /** PLN gross per month; null = free plan. */
  monthlyPln: number | null;
  /** PLN gross per year; null = free plan. */
  yearlyPln: number | null;
};

/** BITEK chat memory: "session" = this browser tab only, "project" = saved with the project (studio_bitek_messages). */
export type BitekMemoryAccess = "session" | "project";

export type PlanPolicy = {
  price: PlanPrice;
  /** Studio creative tools (gaps P0, 2026-10-29). */
  tools: {
    /** Lyrics notepad + teleprompter while recording (all logged-in plans). */
    lyrics: boolean;
    bitekMemory: BitekMemoryAccess;
    vocalPresets: {
      /** Built-in vocal sound presets (FX chain) — every plan. */
      builtIn: boolean;
      /** Own saved presets; 0 = cannot save. */
      maxOwn: number;
      /** Preset sets for lead / doubles / adlibs (built-in + own sets). */
      roleSets: boolean;
    };
    /** Vocal pitch correction (BRD Tune) — gaps P0 #1. */
    pitchCorrection: {
      /** Natural style (gentle retune, key-locked) — every plan. */
      natural: boolean;
      /** Hard "trap" style + own retune speed / strength. */
      custom: boolean;
      /** Manual note-by-note correction (BRD Tune note editor) — GOLD. */
      manualNotes: boolean;
    };
    /** Vocal cleanup (noise + room reverb reduction, E3 job) — gaps P1 #5. Takes per Warsaw day. */
    vocalCleanup: { perDay: number };
  };
  /** Private listen links to the approved master (gaps P1) — no download, expiring, revocable. */
  sharing: {
    /** Active (not expired / revoked) links at the same time; null = unlimited. */
    listenLinksActive: number | null;
    /** Longest link lifetime in days — derived: = file retention (see withDerivedSharing). */
    listenLinkMaxDays: number;
  };
  recording: {
    /** Max length of one take (seconds). */
    maxTakeSeconds: number;
    /** Recording sessions (takes) per UTC day. */
    sessionsPerDay: number;
    /** How long a take stays valid before it expires and is deleted (seconds). */
    takeTtlSeconds: number;
    /** READY takes kept at the same time. */
    maxActiveReady: number;
    /** Calibration, section loop, take lanes, comping (logged-in only). */
    studioRecordingTools: boolean;
  };
  studio: {
    maxProjects: number;
    /**
     * Recording tracks per project (vocal / sample / scratch). The Bit track
     * does NOT count, Master is not a track. Owner 2026-10-29: Free = 1;
     * Owner 2026-10-30: Bronze = 2. Existing projects above the cap keep their
     * tracks; only adding / duplicating is blocked (DB: count >= p_max_tracks).
     */
    maxRecordingTracks: number;
    /**
     * Imported stems per project (they are tracks too, so they also count toward
     * maxRecordingTracks). 0 = no stem import. Owner 2026-11-06: Silver 8, Gold 16
     * (browser memory: ~90 MB per decoded 4-min stereo stem; 32 needs a server mixdown).
     */
    maxStems: number;
  };
  mastering: {
    /** E3 master jobs per calendar month (Europe/Warsaw); failed/cancelled do not count. */
    mastersPerMonth: number;
    /**
     * Reference mastering (E3 matches tonal balance, loudness and width to an uploaded
     * track): "included" = in the plan, "addon" = paid add-on (plan_addon_entitlements
     * reference_mastering), "none" = locked with an upsell. Styles are for every plan.
     */
    referenceMastering: ReferenceMasteringAccess;
  };
  downloads: {
    /** Finished-file qualities. Empty = no downloads (buttons locked + premium nudge). */
    qualities: readonly PlanDownloadQuality[];
    /** Whole project as ZIP of stems. */
    projectZip: boolean;
    /**
     * YouTube MP4 included per Europe/Warsaw week (Monday 00:00).
     * Gold: 2. Bronze and Silver: 0 — they buy a one-off pack. Free: 0 and cannot buy.
     * Failed and cancelled jobs do not count. Extra videos spend studio_quota_credits kind youtube.
     */
    youtubeVideosPerWeek: number;
    /** Own raw take download. */
    ownTakeRaw: boolean;
    /** Catalogue beat downloads per UTC day. 0 = listen only (button locked). */
    beatsPerDay: number;
  };
  /** Days a finished file / render artifact is kept. Gold is the longest. */
  retentionDays: number;
};

const H = 60 * 60;

export const PLAN_TRIAL_DAYS = 0;

/** Yearly saving vs 12 × monthly, rounded down to whole percent. */
export function yearlySavingPercent(price: PlanPrice): number | null {
  if (price.monthlyPln == null || price.yearlyPln == null) return null;
  const full = price.monthlyPln * 12;
  return Math.floor(((full - price.yearlyPln) / full) * 100);
}

/** DB check studio_listen_links_expiry_chk allows at most 61 days. */
export const LISTEN_LINK_DB_MAX_DAYS = 60;

type PlanPolicyInput = Omit<PlanPolicy, "sharing"> & {
  sharing: Omit<PlanPolicy["sharing"], "listenLinkMaxDays">;
};

/** A listen link never outlives the files it plays: max days = retention (DB-capped). */
function withDerivedSharing(input: Record<PremiumTier, PlanPolicyInput>): Record<PremiumTier, PlanPolicy> {
  const out = {} as Record<PremiumTier, PlanPolicy>;
  for (const tier of Object.keys(input) as PremiumTier[]) {
    const p = input[tier];
    out[tier] = {
      ...p,
      sharing: {
        ...p.sharing,
        listenLinkMaxDays: Math.min(p.retentionDays, LISTEN_LINK_DB_MAX_DAYS),
      },
    };
  }
  return out;
}

export const PLAN_POLICY: Record<PremiumTier, PlanPolicy> = withDerivedSharing({
  FREE: {
    price: { monthlyPln: null, yearlyPln: null },
    tools: {
      lyrics: true,
      bitekMemory: "session",
      vocalPresets: { builtIn: true, maxOwn: 0, roleSets: false },
      pitchCorrection: { natural: true, custom: false, manualNotes: false },
      vocalCleanup: { perDay: 1 },
    },
    sharing: { listenLinksActive: 1 },
    recording: {
      maxTakeSeconds: 30,
      sessionsPerDay: 1,
      takeTtlSeconds: 24 * H,
      maxActiveReady: 3,
      studioRecordingTools: true,
    },
    studio: { maxProjects: 3, maxRecordingTracks: 1, maxStems: 0 },
    mastering: { mastersPerMonth: 2, referenceMastering: "none" },
    downloads: {
      qualities: [],
      projectZip: false,
      youtubeVideosPerWeek: 0,
      ownTakeRaw: false,
      beatsPerDay: 0,
    },
    retentionDays: 2,
  },
  BRONZE: {
    price: { monthlyPln: 14.99, yearlyPln: 119 },
    tools: {
      lyrics: true,
      bitekMemory: "project",
      vocalPresets: { builtIn: true, maxOwn: 0, roleSets: false },
      pitchCorrection: { natural: true, custom: false, manualNotes: false },
      vocalCleanup: { perDay: 5 },
    },
    sharing: { listenLinksActive: 3 },
    recording: {
      maxTakeSeconds: 60,
      sessionsPerDay: 2,
      takeTtlSeconds: 36 * H,
      maxActiveReady: 5,
      studioRecordingTools: true,
    },
    studio: { maxProjects: 10, maxRecordingTracks: 2, maxStems: 0 },
    mastering: { mastersPerMonth: 5, referenceMastering: "none" },
    downloads: {
      qualities: ["MP3_128"],
      projectZip: false,
      youtubeVideosPerWeek: 0,
      ownTakeRaw: false,
      beatsPerDay: 10,
    },
    retentionDays: 7,
  },
  SILVER: {
    price: { monthlyPln: 29.99, yearlyPln: 239 },
    tools: {
      lyrics: true,
      bitekMemory: "project",
      vocalPresets: { builtIn: true, maxOwn: 20, roleSets: false },
      pitchCorrection: { natural: true, custom: true, manualNotes: false },
      vocalCleanup: { perDay: 15 },
    },
    sharing: { listenLinksActive: null },
    recording: {
      maxTakeSeconds: 120,
      sessionsPerDay: 3,
      takeTtlSeconds: 60 * H,
      maxActiveReady: 7,
      studioRecordingTools: true,
    },
    studio: { maxProjects: 25, maxRecordingTracks: 8, maxStems: 8 },
    mastering: { mastersPerMonth: 10, referenceMastering: "addon" },
    downloads: {
      qualities: ["MP3_128", "MP3_192", "MP3_256"],
      projectZip: false,
      youtubeVideosPerWeek: 0,
      ownTakeRaw: false,
      beatsPerDay: 25,
    },
    retentionDays: 30,
  },
  GOLD: {
    price: { monthlyPln: 49.99, yearlyPln: 399 },
    tools: {
      lyrics: true,
      bitekMemory: "project",
      vocalPresets: { builtIn: true, maxOwn: 50, roleSets: true },
      pitchCorrection: { natural: true, custom: true, manualNotes: true },
      vocalCleanup: { perDay: 30 },
    },
    sharing: { listenLinksActive: null },
    recording: {
      maxTakeSeconds: 180,
      sessionsPerDay: 5,
      takeTtlSeconds: 84 * H,
      maxActiveReady: 10,
      studioRecordingTools: true,
    },
    studio: { maxProjects: 50, maxRecordingTracks: 16, maxStems: 16 },
    mastering: { mastersPerMonth: 20, referenceMastering: "included" },
    downloads: {
      qualities: [...PLAN_DOWNLOAD_QUALITIES],
      projectZip: true,
      youtubeVideosPerWeek: 2,
      ownTakeRaw: true,
      beatsPerDay: 50,
    },
    retentionDays: 45,
  },
});

/**
 * Guest (not logged in) — Owner 2026-10-29: no Studio, no recording, no beat
 * downloads; each catalogue beat can be previewed for 20 s, then a sign-in prompt.
 * Studio pages redirect to /sign-in?next=…, Studio and guest-take APIs answer 401.
 */
export const GUEST_POLICY = {
  studio: false,
  recording: false,
  beatDownloadsPerDay: 0,
  previewSeconds: 20,
} as const;

export function planPolicy(tier: PremiumTier): PlanPolicy {
  return PLAN_POLICY[tier];
}

export function bitekMemoryForTier(tier: PremiumTier): BitekMemoryAccess {
  return PLAN_POLICY[tier].tools.bitekMemory;
}

export function vocalPresetAccessForTier(tier: PremiumTier): PlanPolicy["tools"]["vocalPresets"] {
  return PLAN_POLICY[tier].tools.vocalPresets;
}

export function pitchCorrectionAccessForTier(tier: PremiumTier): PlanPolicy["tools"]["pitchCorrection"] {
  return PLAN_POLICY[tier].tools.pitchCorrection;
}

/** Lowest plan that unlocks a Studio tool (for lock labels). */
export function listenLinksForTier(tier: PremiumTier): PlanPolicy["sharing"] {
  return PLAN_POLICY[tier].sharing;
}

export function vocalCleanupPerDayForTier(tier: PremiumTier): number {
  return PLAN_POLICY[tier].tools.vocalCleanup.perDay;
}

export function minimumTierFor(test: (policy: PlanPolicy) => boolean): PremiumTier {
  for (const tier of ["FREE", "BRONZE", "SILVER", "GOLD"] as const) {
    if (test(PLAN_POLICY[tier])) return tier;
  }
  return "GOLD";
}

export function youtubeVideosPerWeekForTier(tier: PremiumTier): number {
  return PLAN_POLICY[tier].downloads.youtubeVideosPerWeek;
}

/** True when the plan itself includes YouTube MP4s (Gold). Buying a pack is separate. */
export function youtubeVideoForTier(tier: PremiumTier): boolean {
  return youtubeVideosPerWeekForTier(tier) > 0;
}

/** Stems per project for the plan (0 = stem import is not part of the plan). */
export function maxStemsForTier(tier: PremiumTier): number {
  return PLAN_POLICY[tier].studio.maxStems;
}

export function maxRecordingTracksForTier(tier: PremiumTier): number {
  return PLAN_POLICY[tier].studio.maxRecordingTracks;
}

export function beatDownloadsPerDayForTier(tier: PremiumTier): number {
  return PLAN_POLICY[tier].downloads.beatsPerDay;
}

export function maxProjectsForTier(tier: PremiumTier): number {
  return PLAN_POLICY[tier].studio.maxProjects;
}

export function mastersPerMonthForTier(tier: PremiumTier): number {
  return PLAN_POLICY[tier].mastering.mastersPerMonth;
}

export function referenceMasteringForTier(tier: PremiumTier): ReferenceMasteringAccess {
  return PLAN_POLICY[tier].mastering.referenceMastering;
}

/** Paid add-ons on top of a plan (plan_addon_entitlements.addon). */
export const PLAN_ADDONS = ["reference_mastering"] as const;
export type PlanAddon = (typeof PLAN_ADDONS)[number];

/** Add-on gross price. Charged only when checkout is enabled (see readPlanPaymentsAvailable). */
export const PLAN_ADDON_PRICE_PLN: Record<PlanAddon, { monthlyPln: number }> = {
  reference_mastering: { monthlyPln: 14.99 },
};

/**
 * One-off packs. Units are added to a server balance and spent only after the
 * plan allowance for that day (takes) or Warsaw month (masters). Not a subscription.
 * Charged only when checkout is enabled.
 */
export const PLAN_PACKS = ["take", "master", "youtube"] as const;
export type PlanPack = (typeof PLAN_PACKS)[number];

/** Take and master packs have one price. YouTube price depends on the live plan. */
export const PLAN_PACK_CATALOG: Record<Exclude<PlanPack, "youtube">, { units: number; pricePln: number }> = {
  take: { units: 10, pricePln: 9.99 },
  master: { units: 5, pricePln: 14.99 },
};

/**
 * One-off YouTube MP4 pack. Not a subscription.
 * Gold buys 2 more for 9.99. Silver buys 1 for 14.99. Bronze buys 1 for 24.99.
 * The charged amount decides how many units the webhook grants.
 */
export const YOUTUBE_PACK_OFFERS = {
  BRONZE: { units: 1, pricePln: 24.99 },
  SILVER: { units: 1, pricePln: 14.99 },
  GOLD: { units: 2, pricePln: 9.99 },
} as const;

export function youtubePackOffer(tier: PremiumTier | null | undefined): { units: number; pricePln: number } | null {
  if (tier === "BRONZE" || tier === "SILVER" || tier === "GOLD") return YOUTUBE_PACK_OFFERS[tier];
  return null;
}

/** Units granted for a paid YouTube pack. Tied to the charged grosz, not the tier at webhook time. */
export function youtubeUnitsForGrosz(amountGrosz: number): number | null {
  if (amountGrosz === 999) return 2;
  if (amountGrosz === 1499 || amountGrosz === 2499) return 1;
  return null;
}

export function isPlanPack(value: unknown): value is PlanPack {
  return value === "take" || value === "master" || value === "youtube";
}

export type ReferenceMasteringGate =
  | { allowed: true; via: "plan" | "addon" }
  | { allowed: false; reason: "plan" | "addon_missing"; minTier: PremiumTier };

/** Server decision (the UI only mirrors it): Gold included, Silver with the add-on, Free/Bronze locked. */
export function referenceMasteringGate(tier: PremiumTier, hasAddon: boolean): ReferenceMasteringGate {
  const access = PLAN_POLICY[tier].mastering.referenceMastering;
  if (access === "included") return { allowed: true, via: "plan" };
  if (access === "addon") return hasAddon ? { allowed: true, via: "addon" } : { allowed: false, reason: "addon_missing", minTier: tier };
  return { allowed: false, reason: "plan", minTier: minimumTierFor((p) => p.mastering.referenceMastering !== "none") };
}

/** Mastering styles (Ciepły / Jasny / Głośny / Dynamiczny) — every plan that can master. */
export function masterStylesForTier(tier: PremiumTier): boolean {
  return PLAN_POLICY[tier].mastering.mastersPerMonth > 0;
}

/**
 * BITEK AUTO MIX-MASTERING. Gold only.
 * A stored flag on a lower plan must not turn this on — callers re-check the tier.
 */
export function bitekAutoMixMasterForTier(tier: PremiumTier): boolean {
  return tier === "GOLD";
}

export function takeTtlSecondsForTier(tier: PremiumTier): number {
  return PLAN_POLICY[tier].recording.takeTtlSeconds;
}

/** Lowest plan that unlocks a download quality (for lock labels). */
export function minimumTierForQuality(quality: PlanDownloadQuality): PremiumTier {
  for (const tier of ["BRONZE", "SILVER", "GOLD"] as const) {
    if (PLAN_POLICY[tier].downloads.qualities.includes(quality)) return tier;
  }
  return "GOLD";
}

export const PAID_TIERS = ["BRONZE", "SILVER", "GOLD"] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

const PAYMENTS_ON = new Set(["1", "true", "yes", "on"]);

/**
 * Checkout flag. Default off, so prices stay display-only until this is set
 * in the environment (and PayU or P24 credentials exist).
 * Read at request time; a Vercel change still needs a redeploy because Next
 * inlines server env at build.
 */
export function readPlanPaymentsAvailable(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return PAYMENTS_ON.has((env.PLAN_PAYMENTS_AVAILABLE ?? "").trim().toLowerCase());
}

/** Snapshot at module load. Tests assert the default (unset env) is off. */
export const PLAN_PAYMENTS_AVAILABLE = readPlanPaymentsAvailable();
