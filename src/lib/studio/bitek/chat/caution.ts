import type { BitekChatContext, BitekChatResult } from "./types";

/**
 * The user decides, so Bitek never blocks a change. But when the request goes against what the
 * analysis just measured, the proposal says so in one sentence (deterministic, no model text).
 * Case: raising the lead vocal while the vocal is already louder than the beat.
 */
const VOCAL_HOT_LU = 2.5;

const TEXT = {
  pl: (lu: string) =>
    `Uwaga: z pomiaru wokal jest już o ${lu} LU głośniejszy od bitu. Jeśli podgłośnimy go jeszcze, bit może go mniej przykrywać, ale łatwo o zbyt jaskrawy wokal. Zastosuj i posłuchaj. Gdy będzie za ostro, cofnij (Ctrl+Z).`,
  en: (lu: string) =>
    `Heads-up: the analysis says the vocal is already ${lu} LU louder than the beat. Raising it more may help clarity but can sound harsh. Apply and listen; undo with Ctrl+Z if it is too much.`,
} as const;

function balanceLu(ctx: BitekChatContext): number | null {
  const a = ctx.analysis;
  if (!a || a.stale) return null;
  const card = a.cards.find((c) => c.id === "balance");
  if (!card?.value) return null;
  const n = Number.parseFloat(card.value.replace(",", ".").replace("−", "-"));
  return Number.isFinite(n) ? n : null;
}

export function withMeasurementCaution(result: BitekChatResult, ctx: BitekChatContext): BitekChatResult {
  if (ctx.step !== "mix" || result.proposals.length === 0) return result;
  const lu = balanceLu(ctx);
  if (lu === null || lu < VOCAL_HOT_LU) return result;
  const raisesLead = result.proposals.some((p) => {
    if (p.param !== "gainDb" || typeof p.value !== "number") return false;
    const track = ctx.tracks.find((t) => t.ref === p.trackRef);
    return Boolean(track) && track!.role === "lead_vocal" && p.value > track!.gainDb;
  });
  if (!raisesLead) return result;
  const note = TEXT[ctx.lang](lu.toFixed(1).replace(/^(\d)/, "+$1"));
  if (result.reply.includes(note)) return result;
  return { ...result, reply: `${result.reply} ${note}`.trim() };
}
