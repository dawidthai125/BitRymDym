import { validateBitekJobs } from "./jobs";
import {
  BITEK_LIMITS,
  BITEK_MASTER_REF,
  BITEK_MASTER_SETTINGS,
  BITEK_TUNE_ROLES,
  type BitekChatContext,
  type BitekJob,
  type BitekMasterSetting,
  type BitekProposal,
  type BitekTuneLevel,
} from "./types";
import { isBitekWrongLanguage, sanitizeLabel } from "./prompt";
import type { BitekLang, BitekTrackContext } from "./types";

const fmtDb = (n: number) => `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${Math.abs(n)}`;
const fmtPan = (n: number) => (n === 0 ? "C" : `${n < 0 ? "L" : "R"}${Math.round(Math.abs(n) * 100)}`);
const TUNE_NAME: Record<BitekLang, Record<BitekTuneLevel, string>> = {
  pl: { 0: "wył.", 1: "naturalne", 2: "twarde (trap)" },
  en: { 0: "off", 1: "natural", 2: "hard (trap)" },
};

/**
 * Button label built server-side from the VALIDATED proposal (current → target), never from model text.
 * gainDb: "Wokal: −6 → −3 dB (+3)", pan: "Wokal: pan C → L50", muted: "Wokal: wycisz" / "Vocal: unmute".
 */
export function buildBitekProposalLabel(
  track: Pick<BitekTrackContext, "name" | "gainDb" | "pan" | "muted" | "tune">,
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
  } else if (param === "tune") {
    const names = TUNE_NAME[lang];
    body = `${lang === "pl" ? "strojenie" : "tuning"} ${names[track.tune ?? 0]} \u2192 ${names[value as BitekTuneLevel]}`;
  } else {
    body = value ? (lang === "pl" ? "wycisz" : "mute") : lang === "pl" ? "włącz dźwięk" : "unmute";
  }
  return `${name}: ${body}`;
}

const MASTER_WHY: Record<BitekLang, Record<BitekMasterSetting, [up: string, down: string]>> = {
  pl: {
    loudness: ["Podnoszę głośność całości, żeby numer nie odstawał od innych.", "Ściszam całość, żeby zostawić zapas i nie spłaszczyć dynamiki."],
    bright: ["Rozjaśniam całość, żeby wokal i hi-haty były wyraźniejsze.", "Przyciemniam całość, żeby góra nie kłuła w uszy."],
    bass: ["Dokładam basu, żeby numer miał więcej dołu.", "Zdejmuję trochę basu, żeby dół nie zamulał."],
    width: ["Poszerzam stereo, żeby numer brzmiał przestrzenniej.", "Zwężam stereo, żeby numer dobrze grał też w mono."],
    squash: ["Mocniej ściskam całość, żeby brzmiała równiej i głośniej.", "Luzuję kompresję, żeby numer miał więcej oddechu."],
  },
  en: {
    loudness: ["I'm raising the overall level so the track doesn't fall behind others.", "I'm lowering the overall level to keep headroom and dynamics."],
    bright: ["I'm brightening the whole song so the vocal and hats come through.", "I'm darkening the top end so it doesn't sting."],
    bass: ["I'm adding bass so the track has more low end.", "I'm pulling some bass out so the low end doesn't get muddy."],
    width: ["I'm widening the stereo image so it sounds bigger.", "I'm narrowing the stereo image so it still works in mono."],
    squash: ["I'm compressing the whole song harder so it sounds tighter and louder.", "I'm easing the compression so the track can breathe."],
  },
};

/** Server template "why" — first person, one sentence, used when the model gave none (or rules / relative). */
export function buildBitekProposalWhy(
  track: Pick<BitekTrackContext, "name" | "gainDb" | "pan" | "muted"> | null,
  param: BitekProposal["param"],
  value: number | boolean,
  lang: BitekLang,
  current?: number,
): string {
  if ((BITEK_MASTER_SETTINGS as readonly string[]).includes(param)) {
    const [up, down] = MASTER_WHY[lang][param as BitekMasterSetting];
    return (value as number) >= (current ?? 0) ? up : down;
  }
  const name = sanitizeLabel(track?.name ?? "", 24) || (lang === "pl" ? "ten ślad" : "this track");
  const pl = lang === "pl";
  if (param === "gainDb") {
    return (value as number) > (track?.gainDb ?? 0)
      ? pl ? `Podgłaśniam ${name}, żeby lepiej przebijał się przez resztę.` : `I'm turning ${name} up so it cuts through the rest.`
      : pl ? `Ściszam ${name}, żeby zrobić miejsce reszcie.` : `I'm turning ${name} down to make room for the rest.`;
  }
  if (param === "tune") {
    return value === 0
      ? pl ? `Wyłączam strojenie na ${name}, żeby głos brzmiał w pełni naturalnie.` : `I'm turning tuning off on ${name} so the voice sounds fully natural.`
      : value === 2
        ? pl ? `Włączam twarde strojenie na ${name} — ten trapowy efekt skaczącej nuty.` : `I'm switching ${name} to hard tuning — that trap snap between notes.`
        : pl ? `Delikatnie dociągam ${name} do tonacji bitu, żeby nie było fałszu.` : `I'm gently pulling ${name} into the beat's key so nothing sounds off.`;
  }
  if (param === "pan") {
    return value === 0
      ? pl ? `Ustawiam ${name} na środku, bo tam niesie cały numer.` : `I'm centring ${name} because that's where it carries the track.`
      : pl ? `Przesuwam ${name} w bok, żeby nie siedział na głównym wokalu.` : `I'm moving ${name} to the side so it doesn't sit on the lead.`;
  }
  return value
    ? pl ? `Wyciszam ${name}, żebyś usłyszał resztę bez niego.` : `I'm muting ${name} so you can hear the rest without it.`
    : pl ? `Włączam ${name} z powrotem do miksu.` : `I'm bringing ${name} back into the mix.`;
}

/** Model "why" → one clean sentence (≤ whyMaxChars), or null when unusable. */
export function pickBitekWhy(raw: unknown, lang: BitekLang): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.replace(/[\u0000-\u001f\u007f<>{}`]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length < 8) return null;
  const first = (/^.+?[.!?](?=\s|$)/.exec(clean)?.[0] ?? clean).trim();
  let out = first;
  if (out.length > BITEK_LIMITS.whyMaxChars) {
    const cut = out.slice(0, BITEK_LIMITS.whyMaxChars - 1);
    out = `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trim()}…`;
  }
  if (isBitekWrongLanguage(out, lang)) return null;
  return out;
}

/** True when a proposal would not change anything (skip it). */
function isNoop(track: BitekTrackContext, param: BitekProposal["param"], v: number | boolean): boolean {
  if (param === "gainDb") return Math.round(track.gainDb * 2) / 2 === v;
  if (param === "pan") return Math.round(track.pan * 100) / 100 === v;
  if (param === "tune") return (track.tune ?? 0) === v;
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
    const { trackRef, param, value, why } = p as Record<string, unknown>;
    if (trackRef !== BITEK_MASTER_REF || !(BITEK_MASTER_SETTINGS as readonly unknown[]).includes(param)) continue;
    const key = param as BitekMasterSetting;
    if (seen.has(key)) continue;
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(n)) continue;
    const requested = Math.round(n * 2) / 2;
    const v = Math.round(Math.min(3, Math.max(-3, n)) * 2) / 2;
    if (v === cur[key]) continue;
    seen.add(key);
    const name = ctx.lang === "pl" ? "Całość" : "Whole song";
    const clamped = key === "loudness" && requested !== v;
    const clampWhy = clamped
      ? ctx.lang === "pl"
        ? `Ustawiam suwak na ${fmtStep(v)}, nie na ${fmtStep(requested)}, bo kończy się na ${fmtStep(v > 0 ? 3 : -3)}.`
        : `I'm setting the fader to ${fmtStep(v)}, not ${fmtStep(requested)}, because it stops at ${fmtStep(v > 0 ? 3 : -3)}.`
      : null;
    out.push({
      trackRef: BITEK_MASTER_REF,
      param: key,
      value: v,
      label: `${name}: ${MASTER_LABEL[ctx.lang][key]} ${fmtStep(cur[key])} \u2192 ${fmtStep(v)}`,
      why: clampWhy ?? pickBitekWhy(why, ctx.lang) ?? buildBitekProposalWhy(null, key, v, ctx.lang, cur[key]),
    });
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
    const { trackRef, param, value, why } = p as Record<string, unknown>;
    const track = typeof trackRef === "string" ? byRef.get(trackRef) : undefined;
    if (!track || typeof trackRef !== "string" || track.hasAudio === false) continue;
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
    } else if (param === "tune") {
      // Pitch correction: vocal tracks only, 0 off / 1 natural / 2 hard.
      if (!BITEK_TUNE_ROLES.includes(track.role)) continue;
      const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      if (n !== 0 && n !== 1 && n !== 2) continue;
      v = n;
    } else continue;
    if (isNoop(track, param, v)) continue;
    seen.add(key);
    out.push({
      trackRef,
      param,
      value: v,
      // Model-provided "label" is ignored on purpose: it may disagree with the clamped value.
      label: buildBitekProposalLabel(track, param, v, ctx.lang),
      why: pickBitekWhy(why, ctx.lang) ?? buildBitekProposalWhy(track, param, v, ctx.lang),
    });
  }
  return out;
}

/** Parse + validate a model answer. Plain-text answers are accepted as a reply with no proposals. */
export function parseBitekModelOutput(
  text: string,
  ctx: BitekChatContext,
): { reply: string; proposals: BitekProposal[]; jobs?: BitekJob[]; backToMix?: boolean } | null {
  const obj = extractJsonObject(text) as { reply?: unknown; proposals?: unknown; jobs?: unknown; backToMix?: unknown } | null;
  if (obj && typeof obj.reply === "string" && obj.reply.trim()) {
    const jobs = validateBitekJobs(obj.jobs, ctx);
    return {
      reply: obj.reply.trim().slice(0, BITEK_LIMITS.replyMaxChars),
      proposals: validateProposals(obj.proposals, ctx),
      ...(jobs.length ? { jobs } : {}),
      ...(ctx.step === "master" && obj.backToMix === true ? { backToMix: true } : {}),
    };
  }
  const plain = text.replace(/```[\s\S]*?```/g, "").trim();
  if (!plain || plain.startsWith("{")) return null;
  return { reply: plain.slice(0, BITEK_LIMITS.replyMaxChars), proposals: [] };
}
