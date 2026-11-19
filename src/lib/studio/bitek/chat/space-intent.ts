/**
 * Deterministic "more / less reverb, echo, roomier vocal" in the Mix step. A model that cannot see an
 * effect amount answers "I can't"; this turns a clear ask into one real proposal (space level of the
 * lead vocal), so the user gets a button instead.
 */
import { validateProposals } from "./proposals";
import { BITEK_TUNE_ROLES, type BitekChatContext, type BitekChatResult, type BitekProposal, type BitekSpaceLevel } from "./types";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");

const SPACE = /poglos|reverb|\bech[oay]\b|delay|przestrzen|szersz|szerzej|wider|roomier|\bwide\b/;
const LESS = /mniej|bez |wylacz|zdejmij|usun|suchy|na sucho|zmniejsz|less|remove|without|dry/;
const MORE = /wiecej|dodaj|wlacz|dolo|podkrec|zwieksz|mocniej|bardziej|more|add|szersz|szerzej|wider|przestrzen|roomier/;
const OTHER_TRACK = /\bbit\w*|\bbici\w*|beat|podklad|instrumental|adlib|dogryw|double|chork|backing/;

const T = {
  pl: {
    more: (n: string) => `Dodam przestrzeni na ${n}: pogłos i echo. Szerokości stereo wokalu nie ruszam, ale pogłos sprawia, że brzmi szerzej. Kliknij „Zastosuj” i posłuchaj.`,
    less: (n: string) => `Zmniejszę pogłos i echo na ${n}, żeby brzmiał bliżej i na sucho. Kliknij „Zastosuj” i posłuchaj.`,
    max: (n: string) => `Pogłos i echo na ${n} są już na maksimum, które proponuję. Jak chcesz więcej, ustaw pogłos ręcznie w Efektach.`,
    none: (n: string) => `Na ${n} nie ma już pogłosu ani echa, więc nie mam co zdejmować.`,
    noTrack: "Nie widzę wokalu z nagraniem, więc nie mam gdzie dodać pogłosu.",
  },
  en: {
    more: (n: string) => `I'll add space on ${n}: reverb and echo. I don't change the vocal's stereo width, but reverb makes it sound wider. Hit "Apply" and listen.`,
    less: (n: string) => `I'll ease reverb and echo on ${n} so it sounds closer and drier. Hit "Apply" and listen.`,
    max: (n: string) => `Reverb and echo on ${n} are already at the most I propose. For more, set reverb by hand in Effects.`,
    none: (n: string) => `${n} has no reverb or echo left, so there is nothing to remove.`,
    noTrack: "I don't see a vocal with a recording, so there is nowhere to add reverb.",
  },
} as const;

export function bitekSpaceChat(message: string, ctx: BitekChatContext): BitekChatResult | null {
  if (ctx.step !== "mix") return null;
  const m = norm(message);
  if (!SPACE.test(m) || OTHER_TRACK.test(m)) return null;
  const tx = T[ctx.lang];
  const lead = ctx.tracks.filter((t) => t.role === "lead_vocal" && t.hasAudio !== false);
  const targets = lead.length ? lead : ctx.tracks.filter((t) => BITEK_TUNE_ROLES.includes(t.role) && t.hasAudio !== false);
  if (!targets.length) return { provider: "rules", reply: tx.noTrack, proposals: [] };
  const less = LESS.test(m) && !/dodaj|wiecej|szersz|more|add/.test(m);
  const more = !less && MORE.test(m);
  if (!less && !more) return null;
  const names = targets.map((t) => t.name).join(", ");
  const raw: BitekProposal[] = [];
  for (const t of targets.slice(0, 2)) {
    const cur = t.space ?? 0;
    const to = (less ? (/bez |wylacz|zdejmij|usun|suchy|na sucho|without|remove|dry/.test(m) ? 0 : cur - 1) : cur + 1) as number;
    const level = Math.min(3, Math.max(0, to)) as BitekSpaceLevel;
    if (level !== cur) raw.push({ trackRef: t.ref, param: "space", value: level, label: "" });
  }
  const proposals = validateProposals(raw, ctx);
  if (!proposals.length) return { provider: "rules", reply: less ? tx.none(names) : tx.max(names), proposals: [] };
  return { provider: "rules", reply: less ? tx.less(names) : tx.more(names), proposals };
}
