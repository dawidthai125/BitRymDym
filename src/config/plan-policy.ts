/**
 * Plan policy SSOT (Owner decisions 2026-10-29, t45s320).
 *
 * One table for everything a plan decides: price, recording, Studio size,
 * mastering quota, downloads, retention and add-ons. Every runtime module
 * (premium-tiers, recording sample policy, premium-export-policy, Studio
 * deliver policy, master quota, project limit) derives its numbers from here
 * and the server enforces them — the UI only mirrors.
 *
 * Payments: there is no payment integration in the app (premium is granted by
 * an admin). Prices are display-only until checkout exists.
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
      /** Manual note-by-note correction — GOLD, follow-up (false until the editor ships). */
      manualNotes: boolean;
    };
    /** Vocal cleanup (noise + room reverb reduction, E3 job) — gaps P1 #5. Takes per Warsaw day. */
    vocalCleanup: { perDay: number };
  };
  /** Private listen links to the approved master (gaps P1) — no download, expiring, revocable. */
  sharing: {
    /** Active (not expired / revoked) links at the same time; null = unlimited. */
    listenLinksActive: number | null;
    /** Longest link lifetime in days (≤ file retention). */
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
     * does NOT count, Master is not a track. Owner 2026-10-29: Free = 1.
     */
    maxRecordingTracks: number;
  };
  mastering: {
    /** E3 master jobs per calendar month (Europe/Warsaw); failed/cancelled do not count. */
    mastersPerMonth: number;
    /** Reference mastering — flag only; the feature itself is in the backlog. */
    referenceMastering: ReferenceMasteringAccess;
  };
  downloads: {
    /** Finished-file qualities. Empty = no downloads (buttons locked + premium nudge). */
    qualities: readonly PlanDownloadQuality[];
    /** Whole project as ZIP of stems. */
    projectZip: boolean;
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

export const PLAN_POLICY: Record<PremiumTier, PlanPolicy> = {
  FREE: {
    price: { monthlyPln: null, yearlyPln: null },
    tools: {
      lyrics: true,
      bitekMemory: "session",
      vocalPresets: { builtIn: true, maxOwn: 0, roleSets: false },
      pitchCorrection: { natural: true, custom: false, manualNotes: false },
      vocalCleanup: { perDay: 1 },
    },
    sharing: { listenLinksActive: 1, listenLinkMaxDays: 2 },
    recording: {
      maxTakeSeconds: 30,
      sessionsPerDay: 1,
      takeTtlSeconds: 24 * H,
      maxActiveReady: 3,
      studioRecordingTools: true,
    },
    studio: { maxProjects: 3, maxRecordingTracks: 1 },
    mastering: { mastersPerMonth: 8, referenceMastering: "none" },
    downloads: {
      qualities: [],
      projectZip: false,
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
    sharing: { listenLinksActive: 3, listenLinkMaxDays: 7 },
    recording: {
      maxTakeSeconds: 60,
      sessionsPerDay: 5,
      takeTtlSeconds: 36 * H,
      maxActiveReady: 5,
      studioRecordingTools: true,
    },
    studio: { maxProjects: 10, maxRecordingTracks: 2 },
    mastering: { mastersPerMonth: 30, referenceMastering: "none" },
    downloads: {
      qualities: ["MP3_128"],
      projectZip: false,
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
    sharing: { listenLinksActive: null, listenLinkMaxDays: 30 },
    recording: {
      maxTakeSeconds: 120,
      sessionsPerDay: 7,
      takeTtlSeconds: 60 * H,
      maxActiveReady: 7,
      studioRecordingTools: true,
    },
    studio: { maxProjects: 25, maxRecordingTracks: 4 },
    mastering: { mastersPerMonth: 80, referenceMastering: "addon" },
    downloads: {
      qualities: ["MP3_128", "MP3_192", "MP3_256"],
      projectZip: false,
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
      pitchCorrection: { natural: true, custom: true, manualNotes: false },
      vocalCleanup: { perDay: 30 },
    },
    sharing: { listenLinksActive: null, listenLinkMaxDays: 30 },
    recording: {
      maxTakeSeconds: 180,
      sessionsPerDay: 10,
      takeTtlSeconds: 84 * H,
      maxActiveReady: 10,
      studioRecordingTools: true,
    },
    studio: { maxProjects: 50, maxRecordingTracks: 7 },
    mastering: { mastersPerMonth: 200, referenceMastering: "included" },
    downloads: {
      qualities: [...PLAN_DOWNLOAD_QUALITIES],
      projectZip: true,
      ownTakeRaw: true,
      beatsPerDay: 50,
    },
    retentionDays: 60,
  },
};

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

/** Reference mastering ships later; the flag only says who will get it. */
export const REFERENCE_MASTERING_STATUS = "backlog" as const;

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

/** No checkout in the app yet → prices are display-only. */
export const PLAN_PAYMENTS_AVAILABLE = false;
