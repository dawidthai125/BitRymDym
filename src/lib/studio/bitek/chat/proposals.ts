import { BITEK_LIMITS, type BitekChatContext, type BitekProposal } from "./types";
import { sanitizeLabel } from "./prompt";

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

export function validateProposals(raw: unknown, ctx: BitekChatContext): BitekProposal[] {
  if (!Array.isArray(raw)) return [];
  const refs = new Set(ctx.tracks.map((t) => t.ref));
  const out: BitekProposal[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    if (out.length >= BITEK_LIMITS.maxProposals) break;
    if (!p || typeof p !== "object") continue;
    const { trackRef, param, value, label } = p as Record<string, unknown>;
    if (typeof trackRef !== "string" || !refs.has(trackRef)) continue;
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
    seen.add(key);
    out.push({
      trackRef,
      param,
      value: v,
      label: sanitizeLabel(typeof label === "string" ? label : "", 60),
    });
  }
  return out;
}

/** Parse + validate a model answer. Plain-text answers are accepted as a reply with no proposals. */
export function parseBitekModelOutput(
  text: string,
  ctx: BitekChatContext,
): { reply: string; proposals: BitekProposal[] } | null {
  const obj = extractJsonObject(text) as { reply?: unknown; proposals?: unknown } | null;
  if (obj && typeof obj.reply === "string" && obj.reply.trim()) {
    return {
      reply: obj.reply.trim().slice(0, BITEK_LIMITS.replyMaxChars),
      proposals: validateProposals(obj.proposals, ctx),
    };
  }
  const plain = text.replace(/```[\s\S]*?```/g, "").trim();
  if (!plain || plain.startsWith("{")) return null;
  return { reply: plain.slice(0, BITEK_LIMITS.replyMaxChars), proposals: [] };
}
