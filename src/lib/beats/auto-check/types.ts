/** Upload filter (auto check) shared types. Mirrors public.beat_auto_check_status. */
export const AUTO_CHECK_STATUSES = [
  "pending",
  "running",
  "passed",
  "rejected_vocals",
  "rejected_match",
  "error",
] as const;
export type AutoCheckStatus = (typeof AUTO_CHECK_STATUSES)[number];

export type ProviderOutcome =
  | "ok"
  | "match"
  | "no_match"
  | "not_configured"
  | "error"
  | "timeout"
  | "skipped";

/** One recognition hit (own catalog or external). */
export type RecognitionMatch = {
  provider: string;
  score: number;
  /** Seconds of overlapping audio, when the provider reports it. */
  matchedSeconds: number | null;
  title?: string | null;
  artist?: string | null;
  /** Own catalog: matched beat id. External: recording id. */
  ref?: string | null;
  url?: string | null;
  offsetSeconds?: number | null;
};

export type RecognitionProviderResult = {
  provider: string;
  /** own_catalog is mandatory; external providers are optional. */
  required: boolean;
  outcome: ProviderOutcome;
  matches: RecognitionMatch[];
  errorCode?: string | null;
};

export type VocalWindow = { startSeconds: number; endSeconds: number; db: number };

export type VocalResult = {
  outcome: "ok" | "error" | "not_configured" | "timeout";
  method: string;
  /** Share of 1 s windows where vocal stem RMS exceeds the threshold (0..1). */
  ratio: number | null;
  /** Fast pre-screen probability of singing/speech, when available (0..1). */
  prescreenScore?: number | null;
  windows: VocalWindow[];
  errorCode?: string | null;
};

export type AutoCheckVerdict = {
  status: Exclude<AutoCheckStatus, "pending" | "running">;
  recognitionScore: number | null;
  vocalRatio: number | null;
  vocalConfidence: number | null;
  errorCode: string | null;
  summaryPl: string;
};
