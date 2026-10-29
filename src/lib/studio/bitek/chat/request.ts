import { BITEK_LIMITS, BITEK_MASTER_SETTINGS, type BitekChatContext, type BitekChatTurn, type BitekMasterSetting } from "./types";

export type BitekChatRequest = { message: string; history: BitekChatTurn[]; context: BitekChatContext };

const num = (v: unknown, lo: number, hi: number, d = 0) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const ROLES = new Set(["lead_vocal", "adlib", "double", "backing", "beat", "instrument", "other"]);
const STATUSES = new Set(["green", "yellow", "red", "na"]);

/** Validate untrusted JSON body. Returns an error code instead of throwing. */
export function parseBitekChatRequest(body: unknown): { ok: true; value: BitekChatRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "bad_body" };
  const b = body as Record<string, unknown>;
  if (typeof b.message !== "string" || !b.message.trim()) return { ok: false, error: "empty_message" };
  if (b.message.length > BITEK_LIMITS.messageMaxChars) return { ok: false, error: "message_too_long" };
  const history: BitekChatTurn[] = Array.isArray(b.history)
    ? b.history
        .filter((h): h is { role: string; content: string } =>
          Boolean(h) && typeof h === "object" && (h.role === "user" || h.role === "assistant") && typeof h.content === "string",
        )
        .slice(-BITEK_LIMITS.historyMaxTurns)
        .map((h) => ({ role: h.role as BitekChatTurn["role"], content: h.content.slice(0, BITEK_LIMITS.historyTurnMaxChars) }))
    : [];
  const c = (b.context ?? {}) as Record<string, unknown>;
  const tracks = Array.isArray(c.tracks)
    ? c.tracks.slice(0, BITEK_LIMITS.maxTracks).map((t, i) => {
        const r = (t ?? {}) as Record<string, unknown>;
        return {
          ref: `t${i + 1}`,
          name: str(r.name, BITEK_LIMITS.trackNameMaxChars),
          role: typeof r.role === "string" && ROLES.has(r.role) ? r.role : "other",
          gainDb: num(r.gainDb, BITEK_LIMITS.gainDbMin, BITEK_LIMITS.gainDbMax),
          pan: num(r.pan, -1, 1),
          muted: r.muted === true,
        };
      })
    : [];
  const a = c.analysis as Record<string, unknown> | null | undefined;
  const analysis =
    a && typeof a === "object"
      ? {
          overall: typeof a.overall === "string" && STATUSES.has(a.overall) ? a.overall : "na",
          stale: a.stale === true,
          cards: (Array.isArray(a.cards) ? a.cards : []).slice(0, 16).map((x) => {
            const r = (x ?? {}) as Record<string, unknown>;
            return {
              id: str(r.id, 24).replace(/[^a-z_]/gi, ""),
              status: typeof r.status === "string" && STATUSES.has(r.status) ? r.status : "na",
              value: str(r.value, 24) || null,
            };
          }),
          masterIntegratedLufs: typeof a.masterIntegratedLufs === "number" && Number.isFinite(a.masterIntegratedLufs) ? a.masterIntegratedLufs : null,
          masterTruePeakDbtp: typeof a.masterTruePeakDbtp === "number" && Number.isFinite(a.masterTruePeakDbtp) ? a.masterTruePeakDbtp : null,
        }
      : null;
  const step = c.step === "mix" ? "mix" : c.step === "master" ? "master" : "record";
  const mm = c.master as Record<string, unknown> | null | undefined;
  const master =
    step === "master" && mm && typeof mm === "object"
      ? {
          target: ["streaming", "youtube", "headphones", "club"].includes(String(mm.target)) ? String(mm.target) : "streaming",
          settings: Object.fromEntries(
            BITEK_MASTER_SETTINGS.map((k) => [k, Math.round(num((mm.settings as Record<string, unknown> | undefined)?.[k], -3, 3) * 2) / 2]),
          ) as Record<BitekMasterSetting, number>,
          cards: (Array.isArray(mm.cards) ? mm.cards : []).slice(0, 12).map((x) => {
            const r = (x ?? {}) as Record<string, unknown>;
            return {
              id: str(r.id, 24).replace(/[^a-z_]/gi, ""),
              status: typeof r.status === "string" && STATUSES.has(r.status) ? r.status : "na",
              value: str(r.value, 24) || null,
            };
          }),
        }
      : null;
  return {
    ok: true,
    value: {
      message: b.message.trim(),
      history,
      context: { lang: c.lang === "en" ? "en" : "pl", step, tracks, analysis, ...(master ? { master } : {}) },
    },
  };
}
