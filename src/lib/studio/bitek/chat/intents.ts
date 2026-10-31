import { MIX_CARD_FIXES } from "@/lib/studio/mix-autofix/plan";
import type { MixCardId } from "@/lib/studio/mix-analysis/verdict";

import { validateBitekJobs } from "./jobs";
import { validateProposals } from "./proposals";
import {
  BITEK_LIMITS,
  BITEK_MIX_FIXES,
  BITEK_TUNE_ROLES,
  type BitekChatContext,
  type BitekChatResult,
  type BitekJob,
  type BitekMixFixId,
  type BitekProposal,
  type BitekTrackContext,
  type BitekTrackFx,
} from "./types";

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
const TUNE = /autotun|auto-tun|stroj|nastroj|dostroj|falsz|\btune|tuning|pitch|melodyn/;
const TUNE_OFF = /bez stroj|wylacz stroj|wylacz autotun|zdejmij|no tune|turn off|disable|without/;
const TUNE_HARD = /trap|tward|mocn|robot|hard|t-pain|efekt/;

const clampGain = (v: number) => Math.min(BITEK_LIMITS.gainDbMax, Math.max(BITEK_LIMITS.gainDbMin, v));

/** Tracks of these roles that are not known to be empty. `hasAudio: false` is skipped. */
function byRole(ctx: BitekChatContext, roles: string[]): BitekTrackContext[] {
  return ctx.tracks.filter((t) => roles.includes(t.role) && t.hasAudio !== false);
}

function emptyRole(ctx: BitekChatContext, roles: string[]): BitekTrackContext[] {
  return ctx.tracks.filter((t) => roles.includes(t.role) && t.hasAudio === false);
}

const T = {
  pl: {
    louder: (n: string) => `Podkręcę ${n} o 2 dB, żeby lepiej się przebijało. Kliknij „Zastosuj” i posłuchaj — jak za dużo, cofnij (Ctrl+Z).`,
    quieter: (n: string) => `Ściszę ${n} o 2 dB, żeby zrobić miejsce reszcie. Zastosuj i posłuchaj.`,
    spread: "Rozłożę Twoje adliby i dogrywki na boki, żeby nie siedziały na głównym wokalu. Zastosuj i sprawdź na słuchawkach.",
    center: "Ustawię Twój główny wokal na środku — tam jest jego miejsce, wtedy niesie cały numer.",
    tuneOn: (n: string) => `Włączę strojenie na ${n} w tonacji bitu. Na planie Free działa styl naturalny, twardy „trapowy” jest od Silver.`,
    tuneHard: (n: string) => `Ustawię ${n} na twarde strojenie — ten trapowy skok między nutami. Zastosuj i posłuchaj.`,
    tuneOff: (n: string) => `Wyłączę strojenie na ${n}, żeby głos brzmiał w pełni naturalnie.`,
    reverb: "Pogłos i echo w tempie bitu dołożę Ci przyciskiem „Popraw wszystko” w MIXIE — adliby dostaną więcej przestrzeni. Ręcznie: Efekty → Pogłos, „mix” ok. 20–30%.",
    noTrack: "Nie widzę takiej ścieżki w Twoim projekcie. Nadaj ścieżkom role (np. Wokal główny, Adlib), wtedy wiem, co komu ustawić.",
    empty: (n: string) => `Ścieżka „${n}” jest pusta — nie ma na niej nagrania. Nagraj ją albo wgraj audio, a dopiero potem ruszę głośność.`,
    needAnalysis: "Najpierw kliknij „Analizuj mix”. Bez świeżego pomiaru nie ruszam suwaków ani EQ.",
    already: (n: string) => `Na „${n}” ten efekt już jest włączony. Nic nie dubluję.`,
    generic: (worst: string | null) =>
      worst
        ? `Najpierw wziąłbym się za kartę „${worst}” — to teraz największy problem. Napisz np. „głośniej wokal” albo „rozrzuć adliby”, a zaproponuję Ci zmianę.`
        : "Powiedz mi, co chcesz zmienić, np. „głośniej wokal”, „ciszej bit” albo „rozrzuć adliby”, a zaproponuję Ci konkretną zmianę.",
  },
  en: {
    louder: (n: string) => `I'll turn ${n} up by 2 dB so it cuts through. Hit "Apply", have a listen, and undo (Ctrl+Z) if it's too much.`,
    quieter: (n: string) => `I'll turn ${n} down by 2 dB to make room for the rest. Apply it and listen.`,
    spread: "I'll spread your adlibs and doubles left and right so they don't sit on top of the lead. Apply and check on headphones.",
    center: "I'll put your lead vocal in the centre — that's where it carries the whole track.",
    tuneOn: (n: string) => `I'll turn on tuning for ${n} in the beat's key. Free uses the natural style; the hard trap style is Silver and up.`,
    tuneHard: (n: string) => `I'll set ${n} to hard tuning — that trap snap between notes. Apply it and listen.`,
    tuneOff: (n: string) => `I'll turn tuning off on ${n} so the voice sounds fully natural.`,
    reverb: "I'll add reverb and tempo-synced delay for you with \"Fix everything\" in MIX — adlibs get more space. By hand: Effects → Reverb, mix around 20–30%.",
    noTrack: "I can't find that track in your project. Give your tracks roles (e.g. Lead vocal, Adlib) so I know what to set where.",
    empty: (n: string) => `“${n}” is empty — nothing is recorded on it. Record or upload audio before I touch the level.`,
    needAnalysis: "Click “Analyze mix” first. I won't move faders or EQ without a fresh measurement.",
    already: (n: string) => `That effect is already on “${n}”. I won't add a second one.`,
    generic: (worst: string | null) =>
      worst
        ? `I'd start with the "${worst}" card — it's the biggest issue right now. Try "louder vocal" or "spread adlibs" and I'll suggest a change.`
        : 'Tell me what to change, e.g. "louder vocal", "quieter beat" or "spread adlibs", and I\'ll suggest a concrete tweak.',
  },
};

export function bitekRulesChat(message: string, ctx: BitekChatContext): BitekChatResult {
  const m = norm(message);
  const tx = T[ctx.lang];
  const done = (reply: string, proposals: BitekProposal[] = [], jobs: BitekJob[] = []): BitekChatResult => {
    const validatedJobs = validateBitekJobs(jobs, ctx);
    return {
      provider: "rules",
      reply,
      proposals: validateProposals(proposals, ctx),
      ...(validatedJobs.length ? { jobs: validatedJobs } : {}),
    };
  };
  const missing = (roles: string[], namesFrom?: BitekTrackContext[]) => {
    const empty = namesFrom ?? emptyRole(ctx, roles);
    if (empty.length) return done(tx.empty(empty.map((t) => t.name).join(", ")));
    return done(tx.noTrack);
  };

  if (has(m, TUNE)) {
    const roles = has(m, ADLIB)
      ? ["adlib", "double", "backing"]
      : byRole(ctx, ["lead_vocal"]).length || emptyRole(ctx, ["lead_vocal"]).length
        ? ["lead_vocal"]
        : ["adlib", "double", "backing"];
    const target = byRole(ctx, roles);
    if (!target.length) return missing(roles);
    const level = has(m, TUNE_OFF) ? 0 : has(m, TUNE_HARD) ? 2 : 1;
    const names = target.map((t) => t.name).join(", ");
    return done(
      level === 0 ? tx.tuneOff(names) : level === 2 ? tx.tuneHard(names) : tx.tuneOn(names),
      target.map((t) => ({ trackRef: t.ref, param: "tune" as const, value: level, label: "" })),
    );
  }

  if (has(m, REVERB)) return done(tx.reverb);

  const FIX_ALL = /popraw wszystko|napraw mix|fix everything|fix the mix|popraw mix/;
  const BALANCE = /wyrown|balans|wokal ginie|vocal (is )?buried/;
  if (has(m, FIX_ALL) || has(m, BALANCE)) {
    if (!ctx.analysis || ctx.analysis.stale) return done(tx.needAnalysis);
    const fixes: BitekMixFixId[] = [];
    if (has(m, BALANCE) && !has(m, FIX_ALL)) fixes.push("balance");
    else {
      for (const card of ctx.analysis.cards) {
        if (card.status !== "red" && card.status !== "yellow") continue;
        if (!(card.id in MIX_CARD_FIXES)) continue;
        for (const f of MIX_CARD_FIXES[card.id as MixCardId]) {
          if ((BITEK_MIX_FIXES as readonly string[]).includes(f) && !fixes.includes(f) && fixes.length < 4) fixes.push(f);
        }
      }
    }
    if (!fixes.length) return done(tx.generic(null));
    if (fixes.includes("balance") && !byRole(ctx, ["lead_vocal", "adlib", "double", "backing"]).length) {
      return missing(["lead_vocal"]);
    }
    return done(
      ctx.lang === "pl"
        ? "Zastosuję poprawkę z pomiaru. Kliknij „Zastosuj” i posłuchaj — cofniesz przez Ctrl+Z."
        : "I'll apply the fix from the measurement. Hit Apply and listen — undo with Ctrl+Z.",
      [],
      [{ kind: "mixFix", fixes, label: "" }],
    );
  }

  const FX_ASK: { re: RegExp; effect: BitekTrackFx }[] = [
    { re: /de-?ess|sybil|sycz/, effect: "deesser" },
    { re: /kompres|compressor/, effect: "compressor" },
    { re: /high-?pass|filtr dol|low cut/, effect: "highpass" },
    { re: /\bgate\b|bramk|odszum/, effect: "gate" },
    { re: /\beq\b|equaliz|korekc/, effect: "eq" },
  ];
  const fx = FX_ASK.find((f) => f.re.test(m));
  if (fx) {
    const onBeat = fx.effect === "eq" && has(m, BEAT) && !has(m, VOCAL);
    const roles = onBeat ? ["beat", "instrument"] : [...BITEK_TUNE_ROLES];
    const target = byRole(ctx, roles);
    if (!target.length) return missing(roles);
    const track = target[0]!;
    if (track.effects?.includes(fx.effect)) return done(tx.already(track.name));
    return done(
      ctx.lang === "pl"
        ? `Dodam to na ${track.name}. Kliknij „Zastosuj” — wejdzie w łańcuch efektów, cofniesz przez Ctrl+Z.`
        : `I'll add it on ${track.name}. Hit Apply — it goes on the effect chain, undo with Ctrl+Z.`,
      [],
      [{ kind: "trackFx", trackRef: track.ref, effect: fx.effect, label: "" }],
    );
  }

  if (has(m, SPREAD) && (has(m, ADLIB) || !has(m, VOCAL))) {
    const side = byRole(ctx, ["adlib", "double", "backing"]);
    if (!side.length) return missing(["adlib", "double", "backing"]);
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
    if (!lead.length) return missing(["lead_vocal"]);
    return done(tx.center, lead.map((t) => ({ trackRef: t.ref, param: "pan" as const, value: 0, label: "" })));
  }

  const louder = has(m, LOUDER);
  const quieter = has(m, QUIETER);
  if (louder || quieter) {
    const roles = has(m, ADLIB)
      ? ["adlib", "double", "backing"]
      : has(m, BEAT) && !has(m, VOCAL)
        ? ["beat", "instrument"]
        : byRole(ctx, ["lead_vocal"]).length || emptyRole(ctx, ["lead_vocal"]).length
          ? ["lead_vocal"]
          : ["adlib", "double", "backing"];
    const target = byRole(ctx, roles);
    if (!target.length) return missing(roles);
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
