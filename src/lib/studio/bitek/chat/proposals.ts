import { BITEK_LIMITS, BITEK_MASTER_REF, BITEK_MASTER_SETTINGS, type BitekChatContext, type BitekMasterSetting, type BitekProposal } from "./types";
import { sanitizeLabel } from "./prompt";
import type { BitekLang, BitekTrackContext } from "./types";

const fmtDb = (n: number) => `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${Math.abs(n)}`;
const fmtPan = (n: number) => (n === 0 ? "C" : `${n < 0 ? "L" : "R"}${Math.round(Math.abs(n) * 100)}`);

/**
 * Button label built server-side from the VALIDATED proposal (current → target), never from model text.
 * gainDb: "Wokal: −6 → −3 dB (+3)", pan: "Wokal: pan C → L50", muted: "Wokal: wycisz" / "Vocal: unmute".
 */
export function buildBitekProposalLabel(
  track: Pick<BitekTrackContext, "name" | "gainDb" | "pan" | "muted">,
  param: BitekProposal["param"],
  value: number | boolean,
  lang: BitekLang,
): string {
  const name = sanitizeLabel(track.name, 24) || (lang === "pl" ? "Ślad" : "Track");
  let body: string;
  if (param === "gainDb") {
    const cur = Math.round(track.gainDb * 2) / 2;
    const v = value as number;
    const d = Math.round((v - cur) * 2) / 2;
    body = `${fmtDb(cur)} \u2192 ${fmtDb(v)} dB (${fmtDb(d)})`;
  } else if (param === "pan") {
    body = `pan ${fmtPan(Math.round(track.pan * 100) / 100)} \u2192 ${fmtPan(value as number)}`;
  } else {
    body = value ? (lang === "pl" ? "wycisz" : "mute") : lang === "pl" ? "włącz dźwięk" : "unmute";
  }
  return `${name}: ${body}`;
}

/** True when a proposal would not change anything (skip it). */
function isNoop(track: BitekTrackContext, param: BitekProposal["param"], v: number | boolean): boolean {
  if (param === "gainDb") return Math.round(track.gainDb * 2) / 2 === v;
  if (param === "pan") return Math.round(track.pan * 100) / 100 === v;
  return track.muted === v;
}

/** Extract the first {...} JSON object from model text (models sometimes wrap it in prose/fences). */
function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const MASTER_LABEL: Record<"pl" | "en", Record<BitekMasterSetting, string>> = {
  pl: { loudness: "głośność", bright: "jasność", bass: "bas", width: "szerokość", squash: "ściśnięcie" },
  en: { loudness: "loudness", bright: "brightness", bass: "bass", width: "width", squash: "compression" },
};
const fmtStep = (n: number) => `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${Math.abs(n)}`;

/** Mastering proposals: only whole-track settings, only in the master step, -3..3 in 0.5 steps. */
function validateMasterProposals(raw: unknown[], ctx: BitekChatContext): BitekProposal[] {
  const cur = ctx.master?.settings;
  if (ctx.step !== "master" || !cur) return [];
  const out: BitekProposal[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    if (out.length >= BITEK_LIMITS.maxProposals) break;
    if (!p || typeof p !== "object") continue;
    const { trackRef, param, value } = p as Record<string, unknown>;
    if (trackRef !== BITEK_MASTER_REF || !(BITEK_MASTER_SETTINGS as readonly unknown[]).includes(param)) continue;
    const key = param as BitekMasterSetting;
    if (seen.has(key)) continue;
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(n)) continue;
    const v = Math.round(Math.min(3, Math.max(-3, n)) * 2) / 2;
    if (v === cur[key]) continue;
    seen.add(key);
    const name = ctx.lang === "pl" ? "Całość" : "Whole song";
    out.push({ trackRef: BITEK_MASTER_REF, param: key, value: v, label: `${name}: ${MASTER_LABEL[ctx.lang][key]} ${fmtStep(cur[key])} \u2192 ${fmtStep(v)}` });
  }
  return out;
}

export function validateProposals(raw: unknown, ctx: BitekChatContext): BitekProposal[] {
  if (!Array.isArray(raw)) return [];
  // In Mastering BITEK hears ONE stereo track: per-track proposals are never valid there.
  if (ctx.step === "master") return validateMasterProposals(raw, ctx);
  const byRef = new Map(ctx.tracks.map((t) => [t.ref, t] as const));
  const out: BitekProposal[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    if (out.length >= BITEK_LIMITS.maxProposals) break;
    if (!p || typeof p !== "object") continue;
    const { trackRef, param, value } = p as Record<string, unknown>;
    const track = typeof trackRef === "string" ? byRef.get(trackRef) : undefined;
    if (!track || typeof trackRef !== "string") continue;
    const key = `${trackRef}:${String(param)}`;
    if (seen.has(key)) continue;
    let v: number | boolean;
    if (param === "gainDb" || param === "pan") {
      const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      if (!Number.isFinite(n)) continue;
      v =
        param === "gainDb"
          ? Math.round(Math.min(BITEK_LIMITS.gainDbMax, Math.max(BITEK_LIMITS.gainDbMin, n)) * 2) / 2
          : Math.round(Math.min(1, Math.max(-1, n)) * 100) / 100;
    } else if (param === "muted") {
      if (typeof value !== "boolean") continue;
      v = value;
    } else continue;
    if (isNoop(track, param, v)) continue;
    seen.add(key);
    out.push({
      trackRef,
      param,
      value: v,
      // Model-provided "label" is ignored on purpose: it may disagree with the clamped value.
      label: buildBitekProposalLabel(track, param, v, ctx.lang),
    });
  }
  return out;
}

/** Parse + validate a model answer. Plain-text answers are accepted as a reply with no proposals. */
export function parseBitekModelOutput(
  text: string,
  ctx: BitekChatContext,
): { reply: string; proposals: BitekProposal[]; backToMix?: boolean } | null {
  const obj = extractJsonObject(text) as { reply?: unknown; proposals?: unknown; backToMix?: unknown } | null;
  if (obj && typeof obj.reply === "string" && obj.reply.trim()) {
    return {
      reply: obj.reply.trim().slice(0, BITEK_LIMITS.replyMaxChars),
      proposals: validateProposals(obj.proposals, ctx),
      ...(ctx.step === "master" && obj.backToMix === true ? { backToMix: true } : {}),
    };
  }
  const plain = text.replace(/```[\s\S]*?```/g, "").trim();
  if (!plain || plain.startsWith("{")) return null;
  return { reply: plain.slice(0, BITEK_LIMITS.replyMaxChars), proposals: [] };
}
