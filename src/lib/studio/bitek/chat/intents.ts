import { validateProposals } from "./proposals";
import { BITEK_LIMITS, type BitekChatContext, type BitekChatResult, type BitekProposal, type BitekTrackContext } from "./types";

/** Rule-based last-resort brain: keyword intents → validated proposals, no network. */

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");

const has = (s: string, re: RegExp) => re.test(s);
const VOCAL = /wokal|vocal|glos|voice|rap|zwrotk/;
const BEAT = /\bbit|beat|podklad|instrumental/;
const ADLIB = /adlib|ad-lib|dogryw|double|chork|backing/;
const LOUDER = /glosniej|podglosn|podkrec|wyzej|louder|turn up|boost|wiecej (wokalu|bitu)/;
const QUIETER = /ciszej|scisz|przycisz|nizej|quieter|turn down|lower|mniej (wokalu|bitu)/;
const SPREAD = /rozrzuc|rozloz|rozstaw|na boki|szerzej|spread|wider|pan/;
const CENTER = /na srod|wysrodk|center|centre|middle/;
const REVERB = /poglos|reverb|echo|delay|poglosu/;

const clampGain = (v: number) => Math.min(BITEK_LIMITS.gainDbMax, Math.max(BITEK_LIMITS.gainDbMin, v));

function byRole(ctx: BitekChatContext, roles: string[]): BitekTrackContext[] {
  return ctx.tracks.filter((t) => roles.includes(t.role));
}

const T = {
  pl: {
    louder: (n: string) => `Podkręcam ${n} o 2 dB — kliknij „Zastosuj”, posłuchaj, a jak za dużo, cofnij (Ctrl+Z).`,
    quieter: (n: string) => `Ściszam ${n} o 2 dB. Zastosuj i posłuchaj na tle reszty.`,
    spread: "Rozkładam adliby i dogrywki na boki, żeby nie siedziały na głównym wokalu. Zastosuj i sprawdź na słuchawkach.",
    center: "Ustawiam główny wokal na środek — tam jest jego miejsce.",
    reverb: "Pogłos na adlibach ustawisz w efektach ścieżki (zakładka Efekty → Pogłos, „mix” ok. 20–30%). Automatyczną zmianę efektów dodam później.",
    noTrack: "Nie widzę takiej ścieżki w projekcie. Nadaj ścieżkom role (np. Wokal główny, Adlib), wtedy łatwiej mi pomóc.",
    generic: (worst: string | null) =>
      worst
        ? `Najpierw ogarnij kartę „${worst}” — to teraz największy problem. Napisz np. „głośniej wokal” albo „rozrzuć adliby”, a zaproponuję zmianę.`
        : "Napisz, co chcesz zmienić, np. „głośniej wokal”, „ciszej bit” albo „rozrzuć adliby”, a zaproponuję konkretną zmianę.",
  },
  en: {
    louder: (n: string) => `Turning ${n} up by 2 dB — hit "Apply", have a listen, and undo (Ctrl+Z) if it's too much.`,
    quieter: (n: string) => `Turning ${n} down by 2 dB. Apply it and listen against the rest.`,
    spread: "Spreading adlibs and doubles left and right so they don't sit on top of the lead. Apply and check on headphones.",
    center: "Putting the lead vocal back in the centre — that's where it belongs.",
    reverb: "Set adlib reverb in the track effects (Effects → Reverb, mix around 20–30%). Automatic effect changes come later.",
    noTrack: "I can't find that track. Give your tracks roles (e.g. Lead vocal, Adlib) and I can help better.",
    generic: (worst: string | null) =>
      worst
        ? `Sort out the "${worst}" card first — it's the biggest issue right now. Try "louder vocal" or "spread adlibs" and I'll suggest a change.`
        : 'Tell me what to change, e.g. "louder vocal", "quieter beat" or "spread adlibs", and I\'ll suggest a concrete tweak.',
  },
};

export function bitekRulesChat(message: string, ctx: BitekChatContext): BitekChatResult {
  const m = norm(message);
  const tx = T[ctx.lang];
  const done = (reply: string, proposals: BitekProposal[] = []): BitekChatResult => ({
    provider: "rules",
    reply,
    // Same validation + server-side labels as model proposals.
    proposals: validateProposals(proposals, ctx),
  });

  if (has(m, REVERB)) return done(tx.reverb);

  if (has(m, SPREAD) && (has(m, ADLIB) || !has(m, VOCAL))) {
    const side = byRole(ctx, ["adlib", "double", "backing"]);
    if (!side.length) return done(tx.noTrack);
    return done(
      tx.spread,
      side.map((t, i) => {
        const pan = i % 2 === 0 ? -0.5 : 0.5;
        return { trackRef: t.ref, param: "pan" as const, value: pan, label: "" };
      }),
    );
  }

  if (has(m, CENTER) && has(m, VOCAL)) {
    const lead = byRole(ctx, ["lead_vocal"]);
    if (!lead.length) return done(tx.noTrack);
    return done(tx.center, lead.map((t) => ({ trackRef: t.ref, param: "pan" as const, value: 0, label: "" })));
  }

  const louder = has(m, LOUDER);
  const quieter = has(m, QUIETER);
  if (louder || quieter) {
    const target = has(m, ADLIB)
      ? byRole(ctx, ["adlib", "double", "backing"])
      : has(m, BEAT) && !has(m, VOCAL)
        ? byRole(ctx, ["beat", "instrument"])
        : byRole(ctx, ["lead_vocal"]).length
          ? byRole(ctx, ["lead_vocal"])
          : byRole(ctx, ["adlib", "double", "backing"]);
    if (!target.length) return done(tx.noTrack);
    const delta = louder ? 2 : -2;
    const names = target.map((t) => t.name).join(", ");
    return done(
      louder ? tx.louder(names) : tx.quieter(names),
      target.map((t) => {
        const v = clampGain(Math.round((t.gainDb + delta) * 2) / 2);
        return { trackRef: t.ref, param: "gainDb" as const, value: v, label: "" };
      }),
    );
  }

  const worst =
    ctx.analysis?.cards.find((c) => c.status === "red") ?? ctx.analysis?.cards.find((c) => c.status === "yellow") ?? null;
  return done(tx.generic(worst ? worst.id : null));
}
