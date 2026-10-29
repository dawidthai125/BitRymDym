/**
 * Conversational follow-ups (gaps P0 #4, like cryo-mix Nova): short relative
 * asks — "więcej", "trochę mniej", "za dużo", "cofnij" / "more", "too much",
 * "undo" — act on the LAST change the user applied from BITEK. Deterministic
 * and offline, so it works the same on every provider (and in rules mode).
 */
import { validateProposals } from "./proposals";
import {
  BITEK_LIMITS,
  BITEK_MASTER_REF,
  BITEK_MASTER_SETTINGS,
  type BitekChange,
  type BitekChatContext,
  type BitekChatResult,
  type BitekLang,
  type BitekMasterSetting,
  type BitekProposal,
  type BitekRelativeKind,
} from "./types";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");

const UNDO = /\b(cofnij|wroc|przywroc|odkrec|undo|revert|put it back|go back)\b/;
const TOO_MUCH = /za duzo|przesadz|za mocno|zbyt mocno|zbyt duzo|too much|overdid|overdone|too strong|a bit much/;
const TOO_LITTLE = /za malo|za slabo|zbyt malo|zbyt slabo|not enough|too little|too subtle/;
const MORE = /\b(wiecej|jeszcze|mocniej|bardziej|dalej|more|further|again|harder|stronger)\b/;
const LESS = /\b(mniej|slabiej|lzej|less|softer|weaker)\b/;
const HALF = /\b(troche|troszke|troszeczke|odrobin\w*|lekko|ciut|delikatnie|bit|slightly|little|tad)\b/;
const LOUDER = /glosniej|podglosn|podkrec|louder|turn (it )?up/;
const QUIETER = /ciszej|scisz|przycisz|quieter|turn (it )?down/;
const TARGETS: { re: RegExp; roles: string[] }[] = [
  { re: /adlib|ad-lib|dogryw|double|dubl|chork|backing/, roles: ["adlib", "double", "backing"] },
  { re: /\bbit\w*|beat|podklad|instrumental/, roles: ["beat", "instrument"] },
  { re: /wokal|vocal|glos\b|voice|zwrotk/, roles: ["lead_vocal"] },
];
const MAX_WORDS = 8;

const isMasterParam = (p: string): p is BitekMasterSetting => (BITEK_MASTER_SETTINGS as readonly string[]).includes(p);

export function classifyBitekRelative(message: string): { kind: BitekRelativeKind; direction: 1 | -1 | 0 } | null {
  const m = norm(message).trim();
  const words = m.match(/[\p{L}\p{N}-]+/gu) ?? [];
  if (words.length === 0 || words.length > MAX_WORDS) return null;
  const direction: 1 | -1 | 0 = LOUDER.test(m) ? 1 : QUIETER.test(m) ? -1 : 0;
  if (UNDO.test(m)) return { kind: "undo", direction: 0 };
  if (TOO_MUCH.test(m)) return { kind: "less", direction };
  if (TOO_LITTLE.test(m)) return { kind: "too_little", direction };
  if (LESS.test(m)) return { kind: "less", direction };
  if (MORE.test(m)) return { kind: HALF.test(m) ? "bit_more" : "more", direction };
  // "trochę ciszej" / "a bit louder" with no other word: a nudge on the last change.
  if (direction !== 0 && HALF.test(m)) return { kind: "bit_more", direction };
  return null;
}

/** Message names a target (vocal / beat / adlibs) different from what was last changed → not a follow-up. */
function namesOtherTarget(message: string, changes: BitekChange[], ctx: BitekChatContext): boolean {
  const m = norm(message);
  const roles = new Set(changes.map((c) => ctx.tracks.find((t) => t.ref === c.trackRef)?.role ?? (c.trackRef === BITEK_MASTER_REF ? "master" : "")));
  for (const t of TARGETS) {
    if (t.re.test(m) && !t.roles.some((r) => roles.has(r))) return true;
  }
  return false;
}

const STEP = { gainDb: 0.5, pan: 0.05, master: 0.5 } as const;

function roundTo(v: number, step: number): number {
  return Math.round(v / step) * step;
}

/** Next numeric value for a relative kind, based on the CURRENT value and the last delta. */
export function nextRelativeValue(params: {
  kind: BitekRelativeKind;
  direction: 1 | -1 | 0;
  param: string;
  current: number;
  from: number;
  to: number;
}): number {
  const { kind, param, current, from, to } = params;
  const step = param === "gainDb" ? STEP.gainDb : param === "pan" ? STEP.pan : STEP.master;
  const [lo, hi] =
    param === "gainDb" ? [BITEK_LIMITS.gainDbMin, BITEK_LIMITS.gainDbMax] : param === "pan" ? [-1, 1] : [-3, 3];
  if (kind === "undo") return Math.min(hi, Math.max(lo, from));
  let delta = to - from;
  if (delta === 0) delta = step;
  // Explicit "louder/quieter" sets the direction for level changes.
  if (params.direction !== 0 && (param === "gainDb" || param === "loudness")) {
    const sameWay = Math.sign(delta) === params.direction;
    const k = kind === "bit_more" || !sameWay ? 0.5 : 1;
    delta = params.direction * Math.abs(delta) * k;
  } else if (kind === "more") {
    // keep delta
  } else if (kind === "bit_more" || kind === "too_little") {
    delta *= 0.5;
  } else {
    delta *= -0.5; // less / too much: pull back half
  }
  let next = roundTo(current + delta, step);
  if (next === roundTo(current, step)) next = roundTo(current + Math.sign(delta) * step, step);
  next = Math.min(hi, Math.max(lo, next));
  return param === "pan" ? Math.round(next * 100) / 100 : next;
}

const REPLY: Record<BitekLang, Record<BitekRelativeKind | "limit", string>> = {
  pl: {
    more: "Dokładam jeszcze tyle samo, co ostatnio. Kliknij „Zastosuj” i posłuchaj.",
    bit_more: "Dorzucam jeszcze odrobinę w tę samą stronę. Zastosuj i posłuchaj.",
    less: "Racja, przesadziłem — cofam połowę ostatniej zmiany. Zastosuj i porównaj.",
    too_little: "Dobra, dokładam jeszcze połowę tego, co ostatnio. Zastosuj i posłuchaj.",
    undo: "Jasne, wracam do ustawień sprzed mojej ostatniej zmiany.",
    limit: "Dalej już nie pójdę — to granica tego ustawienia. Napisz, co innego mam zmienić.",
  },
  en: {
    more: "I'll add the same amount again. Hit \"Apply\" and listen.",
    bit_more: "I'll nudge it a little further the same way. Apply and listen.",
    less: "Fair, I overdid it — I'll pull back half of the last change. Apply and compare.",
    too_little: "OK, I'll add half of the last change again. Apply and listen.",
    undo: "Sure, I'll go back to how it was before my last change.",
    limit: "I won't push it further — that's the limit for this setting. Tell me what else to change.",
  },
};

const WHY: Record<BitekLang, Record<BitekRelativeKind, string>> = {
  pl: {
    more: "Idę dalej w tę samą stronę, bo poprzednia zmiana była za mała.",
    bit_more: "Dokładam odrobinę, żeby dojść do celu bez przesady.",
    less: "Cofam połowę, bo napisałeś, że to za dużo.",
    too_little: "Dokładam połowę, bo napisałeś, że to za mało.",
    undo: "Wracam do poprzedniego ustawienia, bo ta zmiana Ci nie pasuje.",
  },
  en: {
    more: "I'm going further the same way because the last change wasn't enough.",
    bit_more: "I'm adding a touch more to get there without overdoing it.",
    less: "I'm pulling back half because you said it was too much.",
    too_little: "I'm adding half again because you said it wasn't enough.",
    undo: "I'm going back to the previous setting because the change didn't work for you.",
  },
};

/** Relative follow-up → result, or null when the message is not one (then the normal chain runs). */
export function resolveBitekRelative(message: string, ctx: BitekChatContext): BitekChatResult | null {
  const changes = (ctx.lastChange ?? []).slice(0, BITEK_LIMITS.maxProposals);
  if (changes.length === 0) return null;
  const cls = classifyBitekRelative(message);
  if (!cls) return null;
  if (namesOtherTarget(message, changes, ctx)) return null;
  const raw: BitekProposal[] = [];
  for (const c of changes) {
    if (ctx.step === "master") {
      if (c.trackRef !== BITEK_MASTER_REF || !isMasterParam(c.param) || !ctx.master) continue;
      if (typeof c.from !== "number" || typeof c.to !== "number") continue;
      const current = ctx.master.settings[c.param];
      raw.push({ trackRef: c.trackRef, param: c.param, value: nextRelativeValue({ ...cls, param: c.param, current, from: c.from, to: c.to }), label: "" });
      continue;
    }
    const track = ctx.tracks.find((t) => t.ref === c.trackRef);
    if (!track) continue;
    if (c.param === "muted") {
      if (cls.kind === "undo" && typeof c.from === "boolean") raw.push({ trackRef: c.trackRef, param: "muted", value: c.from, label: "" });
      continue;
    }
    if (c.param === "tune") {
      // Tuning has 3 levels: "more" → hard, "less / too much" → natural (or off), "undo" → before.
      if (typeof c.from !== "number" || typeof c.to !== "number") continue;
      const cur = track.tune ?? (c.to as number);
      const value =
        cls.kind === "undo" ? c.from : cls.kind === "less" ? Math.max(0, cur - 1) : Math.min(2, cur + 1);
      raw.push({ trackRef: c.trackRef, param: "tune", value, label: "" });
      continue;
    }
    if ((c.param !== "gainDb" && c.param !== "pan") || typeof c.from !== "number" || typeof c.to !== "number") continue;
    const current = c.param === "gainDb" ? track.gainDb : track.pan;
    raw.push({ trackRef: c.trackRef, param: c.param, value: nextRelativeValue({ ...cls, param: c.param, current, from: c.from, to: c.to }), label: "" });
  }
  // Wrong step for the remembered change (e.g. a Mix change while mastering) → not a follow-up.
  if (raw.length === 0) return null;
  const proposals = validateProposals(raw, ctx).map((p) => ({ ...p, why: WHY[ctx.lang][cls.kind] }));
  return {
    provider: "rules",
    reply: proposals.length ? REPLY[ctx.lang][cls.kind] : REPLY[ctx.lang].limit,
    proposals,
    relative: cls.kind,
  };
}
