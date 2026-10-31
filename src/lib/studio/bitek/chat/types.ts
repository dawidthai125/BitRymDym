/** BITEK chat (stage 1b) — shared, framework-free types. */

export type BitekLang = "pl" | "en";
export type BitekChatRole = "user" | "assistant";
export type BitekChatTurn = { role: BitekChatRole; content: string };

export type BitekTrackContext = {
  /** Index-based handle sent to the model ("t1", "t2"…) — never DB ids. */
  ref: string;
  name: string;
  role: string;
  gainDb: number;
  pan: number;
  muted: boolean;
  /** BRD Tune on this track: 0 off, 1 natural, 2 hard / custom (vocal roles only). */
  tune?: BitekTuneLevel;
  /**
   * False when the track has no clip with duration (empty lane).
   * Omitted only for older clients — treated as unknown, not as "has audio".
   */
  hasAudio?: boolean;
  clipCount?: number;
  durationMs?: number;
  solo?: boolean;
  /** Enabled effect types except tune (tune is the numeric field above). */
  effects?: string[];
};

/** Measured input peak from the take that just finished (recording helper only). */
export type BitekTakeLevel = { peakDb: number; clipping: boolean };

export const BITEK_MIX_FIXES = ["gain", "balance", "compression", "eq", "deesser", "denoise", "panorama", "space"] as const;
export type BitekMixFixId = (typeof BITEK_MIX_FIXES)[number];

export const BITEK_TRACK_FX = ["eq", "compressor", "highpass", "deesser", "gate"] as const;
export type BitekTrackFx = (typeof BITEK_TRACK_FX)[number];

export const BITEK_MASTER_STYLES = ["warm", "bright", "loud", "dynamic"] as const;
export type BitekMasterStyle = (typeof BITEK_MASTER_STYLES)[number];

/** One confirmed action. Labels are built on the server, never taken from model text. */
export const BITEK_MASTER_TARGETS = ["streaming", "youtube", "headphones", "club"] as const;
export type BitekMasterTarget = (typeof BITEK_MASTER_TARGETS)[number];

export type BitekJob =
  | { kind: "mixFix"; fixes: BitekMixFixId[]; label: string }
  | { kind: "trackFx"; trackRef: string; effect: BitekTrackFx; label: string }
  | { kind: "masterStyle"; style: BitekMasterStyle; label: string }
  | { kind: "masterTarget"; target: BitekMasterTarget; label: string };

export type BitekTuneLevel = 0 | 1 | 2;
/** Track roles BITEK may tune (pitch correction is a vocal effect). */
export const BITEK_TUNE_ROLES: readonly string[] = ["lead_vocal", "adlib", "double", "backing"];

export type BitekCardContext = { id: string; status: string; value?: string | null };

export type BitekChatContext = {
  lang: BitekLang;
  step: "record" | "mix" | "master";
  tracks: BitekTrackContext[];
  analysis: null | {
    overall: string;
    stale: boolean;
    cards: BitekCardContext[];
    masterIntegratedLufs: number | null;
    masterTruePeakDbtp: number | null;
  };
  /**
   * Conversational mode (gaps P0 #4): the last change the user APPLIED from
   * BITEK (from → to). Lets "więcej / mniej / za dużo / cofnij" act on it.
   */
  lastChange?: BitekChange[] | null;
  /** Stage 3 — Mastering step: BITEK sees the whole song as ONE stereo track. */
  master?: null | {
    target: string;
    settings: Record<BitekMasterSetting, number>;
    cards: BitekCardContext[];
  };
  /** Recording only: peak measured on the mic during the last take. Absent = no measurement. */
  takeLevel?: BitekTakeLevel | null;
};

/** Whole-track macro settings BITEK may propose in Mastering (-3..3 steps). */
export const BITEK_MASTER_SETTINGS = ["loudness", "bright", "bass", "width", "squash"] as const;
export type BitekMasterSetting = (typeof BITEK_MASTER_SETTINGS)[number];
/** Proposals in Mastering use trackRef "master" (the whole song). */
export const BITEK_MASTER_REF = "master";

export type BitekProposalParam = "gainDb" | "pan" | "muted" | "tune" | BitekMasterSetting;

export type BitekProposal = {
  trackRef: string;
  param: BitekProposalParam;
  value: number | boolean;
  /** Button label built server-side from the validated proposal (buildBitekProposalLabel), never from model text. */
  label: string;
  /** One first-person sentence: why BITEK makes this change (model text clipped, or a server template). */
  why?: string;
};

/** An applied change, as remembered for relative follow-ups. */
export type BitekChange = {
  trackRef: string;
  param: BitekProposalParam;
  from: number | boolean;
  to: number | boolean;
};

export type BitekProviderId = "groq" | "gemini" | "e3" | "rules";

export type BitekChatResult = {
  provider: BitekProviderId;
  reply: string;
  proposals: BitekProposal[];
  /** Real actions (FX, measured balance, mastering style). Empty/omitted = chat only. */
  jobs?: BitekJob[];
  /** Mastering: the request was about a single track — offer "Back to Mix". */
  backToMix?: boolean;
  /** Set when the answer was a relative follow-up to the last change. */
  relative?: BitekRelativeKind;
};

export type BitekRelativeKind = "more" | "bit_more" | "less" | "too_little" | "undo";

export const BITEK_LIMITS = {
  messageMaxChars: 500,
  historyMaxTurns: 12,
  historyTurnMaxChars: 1200,
  maxTracks: 24,
  trackNameMaxChars: 40,
  maxProposals: 3,
  whyMaxChars: 160,
  replyMaxChars: 1200,
  dailyMessagesPerUser: 60,
  gainDbMin: -24,
  gainDbMax: 12,
} as const;
