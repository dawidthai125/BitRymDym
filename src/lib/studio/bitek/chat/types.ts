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
};

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
};

/** Whole-track macro settings BITEK may propose in Mastering (-3..3 steps). */
export const BITEK_MASTER_SETTINGS = ["loudness", "bright", "bass", "width", "squash"] as const;
export type BitekMasterSetting = (typeof BITEK_MASTER_SETTINGS)[number];
/** Proposals in Mastering use trackRef "master" (the whole song). */
export const BITEK_MASTER_REF = "master";

export type BitekProposalParam = "gainDb" | "pan" | "muted" | BitekMasterSetting;

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
