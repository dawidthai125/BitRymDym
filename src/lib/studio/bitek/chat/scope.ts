/**
 * The user named one target ("ściszyj bit", "wokal za głośny"): the model must not add changes on
 * other tracks the user never mentioned. Level / pan / mute proposals on tracks outside the named
 * group are dropped; the caller then answers from the deterministic rules instead of the model text
 * (which would still describe the dropped change).
 */
import type { BitekChatContext, BitekChatResult } from "./types";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");

const BEAT = /\bbit\w*|\bbici\w*|beat|podklad|instrumental/;
const VOCAL = /wokal|vocal|\bglos\b|voice|zwrotk/;
const SIDE = /adlib|ad-lib|dogryw|double|dubl|chork|backing/;

/** Effect-type asks: a space / tune proposal is allowed only when the message talks about it. */
const SPACE_WORDS = /poglos|reverb|\bech[oay]\b|delay|przestrzen|szersz|szerzej|roomier|\bwide\b/;
const TUNE_WORDS = /stroj|tune|tuning|pitch|autotun|falsz|melodyn/;

const GROUP_ROLES = {
  beat: ["beat", "instrument"],
  vocal: ["lead_vocal"],
  side: ["adlib", "double", "backing"],
} as const;

export function scopeToNamedTarget(
  result: BitekChatResult,
  message: string,
  ctx: BitekChatContext,
): { result: BitekChatResult; dropped: boolean } {
  if (ctx.step !== "mix") return { result, dropped: false };
  const m = norm(message);
  const asksSpace = SPACE_WORDS.test(m);
  const asksTune = TUNE_WORDS.test(m);
  const named = (["beat", "vocal", "side"] as const).filter((g) => ({ beat: BEAT, vocal: VOCAL, side: SIDE })[g].test(m));
  const allowed = new Set<string>(named.length === 1 ? GROUP_ROLES[named[0]!] : []);
  const kept = result.proposals.filter((p) => {
    // Never add an effect change the user did not talk about, whichever tracks they named.
    if (p.param === "space") return asksSpace;
    if (p.param === "tune") return asksTune;
    if (named.length !== 1) return true;
    if (p.param !== "gainDb" && p.param !== "pan" && p.param !== "muted") return true;
    const track = ctx.tracks.find((t) => t.ref === p.trackRef);
    return !track || allowed.has(track.role);
  });
  if (kept.length === result.proposals.length) return { result, dropped: false };
  return { result: { ...result, proposals: kept }, dropped: true };
}
