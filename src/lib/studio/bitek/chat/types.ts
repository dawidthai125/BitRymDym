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
  step: "record" | "mix";
  tracks: BitekTrackContext[];
  analysis: null | {
    overall: string;
    stale: boolean;
    cards: BitekCardContext[];
    masterIntegratedLufs: number | null;
    masterTruePeakDbtp: number | null;
  };
};

export type BitekProposalParam = "gainDb" | "pan" | "muted";

export type BitekProposal = {
  trackRef: string;
  param: BitekProposalParam;
  value: number | boolean;
  /** Short human label shown on the button (validated, length-capped). */
  label: string;
};

export type BitekProviderId = "groq" | "gemini" | "e3" | "rules";

export type BitekChatResult = {
  provider: BitekProviderId;
  reply: string;
  proposals: BitekProposal[];
};

export const BITEK_LIMITS = {
  messageMaxChars: 500,
  historyMaxTurns: 12,
  historyTurnMaxChars: 1200,
  maxTracks: 24,
  trackNameMaxChars: 40,
  maxProposals: 3,
  replyMaxChars: 1200,
  dailyMessagesPerUser: 60,
  gainDbMin: -24,
  gainDbMax: 12,
} as const;
