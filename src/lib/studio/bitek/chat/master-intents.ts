import { MASTER_TARGETS } from "@/lib/studio/master/targets";

import { validateBitekJobs } from "./jobs";
import { resolveMasterLoudness } from "./master-loudness";
import { validateProposals } from "./proposals";
import {
  BITEK_MASTER_REF,
  type BitekChatContext,
  type BitekChatResult,
  type BitekMasterSetting,
  type BitekMasterStyle,
  type BitekMasterTarget,
  type BitekProposal,
} from "./types";

/**
 * Stage 3 — BITEK in Mastering. Here I hear the whole song as ONE stereo track:
 * whole-track asks (louder/quieter overall, brighter, more bass, wider, less
 * squashed) become setting proposals; single-track asks ("louder vocal",
 * "less reverb on adlibs") are recognised and sent back to Mix.
 * Deterministic — runs BEFORE any LLM so the scope rule can't be talked around.
 */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");

const TRACK_NOUN = /wokal|vocal|glos(?!n)|voice|zwrotk|refren(?! calosc)|adlib|ad-lib|dogryw|double|chork|backing|\bbit(u|em)?\b|\bbeat\b|podklad|instrumental|perkusj|stop[ay]?\b|kick|werbel|snare|hi-?hat|hat(y|s)?\b|sciezk|track \d|slad/;
const TRACK_ONLY_FX = /poglos|reverb|echo|delay|autotune|auto-tune|panoram|\bpan\b|rozrzuc|rozloz|na boki|wycisz|mute|syczy|sybil|deess|de-ess/;
const WHOLE = /calos|caly|cala|calego|numer|utwor|kawalek|piosenk|master|wszystk|everything|whole|overall|song|\bmix\b/;

type Intent = { key: BitekMasterSetting; dir: 1 | -1 };
const INTENTS: { re: RegExp; intent: Intent }[] = [
  { re: /mniej scisn|mniej skompres|wiecej dynamik|bardziej dynamicz|niech oddycha|less (compress|squash)|more dynamic|breath/, intent: { key: "squash", dir: -1 } },
  { re: /bardziej scisn|mocniej scisn|wiecej kompres|wiecej kleju|more (compress|squash|glue)|tighter/, intent: { key: "squash", dir: 1 } },
  { re: /mniej basu|mniej dolu|dudni|zamulon|less bass|boomy|muddy/, intent: { key: "bass", dir: -1 } },
  { re: /wiecej basu|wiecej dolu|mocniejszy dol|wiekszy bas|basow|more bass|more low|bass boost|\bbas\b|\bbass\b/, intent: { key: "bass", dir: 1 } },
  { re: /ciemniej|mniej gory|za ostr|klu(je|ja) w uszy|darker|less (high|top)|harsh/, intent: { key: "bright", dir: -1 } },
  { re: /jasniej|wiecej gory|wiecej powietrza|bardziej krysztal|selektywn|brighter|more (air|top|high)|crisp|bright/, intent: { key: "bright", dir: 1 } },
  { re: /wezej|wezszy|bardziej mono|narrower|less wide|\bmono\b/, intent: { key: "width", dir: -1 } },
  { re: /szerzej|szerszy|wiecej stereo|wider|more stereo|\bwide\b/, intent: { key: "width", dir: 1 } },
  { re: /ciszej|scisz|przycisz|quieter|turn (it )?down|less loud/, intent: { key: "loudness", dir: -1 } },
  { re: /glosniej|podglosn|podkrec|mocniej|louder|turn (it )?up|more loud|bardziej glosn/, intent: { key: "loudness", dir: 1 } },
];

export type MasterScope = { kind: "track"; what: string } | { kind: "whole"; intent: Intent } | { kind: "other" };

export function classifyMasterRequest(message: string): MasterScope {
  const m = norm(message);
  const noun = m.match(TRACK_NOUN);
  const fx = m.match(TRACK_ONLY_FX);
  const intent = INTENTS.find((i) => i.re.test(m))?.intent ?? null;
  // A named track (or a per-track effect) wins unless the user clearly says "the whole song".
  if ((noun || fx) && !(WHOLE.test(m) && !noun)) return { kind: "track", what: (noun ?? fx)![0] };
  if (intent) return { kind: "whole", intent };
  return { kind: "other" };
}

const T = {
  pl: {
    back: "W masteringu tego nie zrobię — tu słyszę Twój numer jako jedną ścieżkę i nie dostanę się do pojedynczego śladu. Wróćmy do Mixu, tam to poprawię. Po zmianach zrobię mastering jeszcze raz.",
    loudness: (up: boolean, goal: string) => `${up ? "Podkręcę" : "Ściszę"} całość o 1 LU (cel ${goal} LUFS). Limiter pilnuje szczytów, więc nic nie przesteruje.`,
    bright: (up: boolean) => (up ? "Dodam całości trochę góry i powietrza, żeby numer był bardziej selektywny." : "Zdejmę trochę góry z całości, żeby nie kłuło w uszy."),
    bass: (up: boolean) => (up ? "Dołożę dołu całemu numerowi, żeby mocniej pchał na słuchawkach i w aucie." : "Odejmę trochę dołu z całości, żeby nie dudniło."),
    width: (up: boolean) => (up ? "Poszerzę stereo całego numeru — z umiarem, żeby na telefonie dalej grało." : "Zwężę trochę stereo, żeby numer był bardziej zwarty."),
    squash: (up: boolean) => (up ? "Mocniej skleję całość kompresją, żeby była bardziej zbita." : "Puszczę kompresję lżej, żeby numer więcej oddychał i miał dynamikę."),
    limit: "Tego już nie podkręcę bardziej — jestem na końcu skali. Spróbuj innego celu albo poprawmy to w Mixie.",
    generic: (worst: string | null) =>
      worst
        ? `W masteringu słyszę cały numer. Najpierw zająłbym się kartą „${worst}”. Napisz np. „głośniej całość”, „jaśniej” albo „więcej basu”.`
        : "Słyszę cały numer jako jedną ścieżkę. Mogę zrobić całość głośniej/ciszej, jaśniej, z większym basem, szerzej albo mniej ściśniętą.",
  },
  en: {
    back: "I can't do that in mastering — here I hear your song as one stereo track and can't reach a single track. Let's go back to Mix, I'll fix it there. After the changes I'll redo the master.",
    loudness: (up: boolean, goal: string) => `I'll turn the whole song ${up ? "up" : "down"} by 1 LU (target ${goal} LUFS). The limiter keeps the peaks safe.`,
    bright: (up: boolean) => (up ? "I'll add a touch of top end and air to the whole song." : "I'll take some top end off the whole song so it doesn't hurt."),
    bass: (up: boolean) => (up ? "I'll add low end to the whole song so it hits harder." : "I'll pull a little low end off the whole song so it doesn't boom."),
    width: (up: boolean) => (up ? "I'll widen the stereo of the whole song — gently, so it still works on a phone." : "I'll narrow the stereo a bit so the song feels tighter."),
    squash: (up: boolean) => (up ? "I'll glue the whole song tighter with compression." : "I'll ease the compression so the song breathes and keeps its dynamics."),
    limit: "I can't push that further — it's at the end of the range. Try another target or let's fix it in Mix.",
    generic: (worst: string | null) =>
      worst
        ? `In mastering I hear the whole song. I'd start with the "${worst}" card. Try "louder overall", "brighter" or "more bass".`
        : "I hear the whole song as one track. I can make it louder/quieter, brighter, bassier, wider or less squashed.",
  },
};

export function bitekMasterRulesChat(message: string, ctx: BitekChatContext, scope = classifyMasterRequest(message)): BitekChatResult {
  const tx = T[ctx.lang];
  if (scope.kind === "track") return { provider: "rules", reply: tx.back, proposals: [], backToMix: true };
  const settings = ctx.master?.settings;
  if (scope.kind === "whole" && settings) {
    const { key, dir } = scope.intent;
    const next = Math.max(-3, Math.min(3, settings[key] + dir));
    const proposals = validateProposals([{ trackRef: BITEK_MASTER_REF, param: key, value: next, label: "" } satisfies BitekProposal], ctx);
    if (!proposals.length) return { provider: "rules", reply: tx.limit, proposals: [] };
    const up = dir > 0;
    const goalLufs = { streaming: -14, youtube: -14, headphones: -16, club: -9 }[ctx.master!.target as "streaming"] ?? -14;
    const reply = key === "loudness" ? tx.loudness(up, String(goalLufs + next).replace(".", ctx.lang === "pl" ? "," : ".")) : tx[key](up);
    return { provider: "rules", reply, proposals };
  }
  const worst = ctx.master?.cards.find((c) => c.status === "red") ?? ctx.master?.cards.find((c) => c.status === "yellow") ?? null;
  return { provider: "rules", reply: tx.generic(worst ? worst.id : null), proposals: [] };
}

const STYLES: { re: RegExp; style: BitekMasterStyle }[] = [
  { re: /styl ciepl|cieply master|warm (master|style)/, style: "warm" },
  { re: /styl jasn|jasny master|bright (master|style)/, style: "bright" },
  { re: /styl glosn|glosny master|loud (master|style)/, style: "loud" },
  { re: /styl dynamic|dynamiczny master|dynamic (master|style)/, style: "dynamic" },
];

/** Named mastering style → one job the user confirms. Null when the message is not a style ask. */
export function bitekMasterStyleChat(message: string, ctx: BitekChatContext): BitekChatResult | null {
  const style = STYLES.find((s) => s.re.test(norm(message)))?.style;
  if (!style || !ctx.master) return null;
  const jobs = validateBitekJobs([{ kind: "masterStyle", style }], ctx);
  if (!jobs.length) return null;
  const reply =
    ctx.lang === "pl"
      ? `Ustawię styl „${jobs[0]!.label.replace(/^Styl masteringu: /, "")}” na całej piosence. Kliknij „Zastosuj”, a jak nie pasuje — cofnij.`
      : `I'll set the “${jobs[0]!.label.replace(/^Mastering style: /, "")}” style on the whole song. Hit Apply, and undo if it doesn't fit.`;
  return { provider: "rules", reply, proposals: [], jobs };
}

const TARGET_ASK: { re: RegExp; id: BitekMasterTarget }[] = [
  { re: /spotify|streaming|do streamu/, id: "streaming" },
  { re: /youtube|tiktok/, id: "youtube" },
  { re: /sluchawk|headphone/, id: "headphones" },
  { re: /klub|club/, id: "club" },
];

const TARGET_NAME: Record<"pl" | "en", Record<BitekMasterTarget, string>> = {
  pl: { streaming: "streamingu", youtube: "YouTube", headphones: "słuchawek", club: "klubu" },
  en: { streaming: "streaming", youtube: "YouTube", headphones: "headphones", club: "club" },
};

/** Switch the mastering loudness target. Null when the message is not that ask. */
export function bitekMasterTargetChat(message: string, ctx: BitekChatContext): BitekChatResult | null {
  const m = norm(message);
  if (!/dopasuj|pod spotify|pod youtube|pod tiktok|pod klub|na sluchawk|for streaming|for youtube|for headphones|for club|cel (streaming|youtube|klub|sluch)/.test(m)) return null;
  if (!ctx.master) return null;
  const id = TARGET_ASK.find((t) => t.re.test(m))?.id;
  if (!id) return null;
  const pl = ctx.lang === "pl";
  const measured = ctx.analysis?.masterIntegratedLufs;
  const peak = ctx.analysis?.masterTruePeakDbtp ?? null;
  const jobs = ctx.master.target === id ? [] : validateBitekJobs([{ kind: "masterTarget", target: id }], ctx);
  if (measured === null || measured === undefined || !Number.isFinite(measured)) {
    if (!jobs.length) {
      return {
        provider: "rules",
        reply: pl
          ? "Ten cel już jest wybrany. Nie mam pomiaru LUFS, więc nie zgaduję, o ile LU podnieść. Zrób master, wtedy powiem z liczb."
          : "That target is already selected. I don't have a LUFS measurement, so I won't guess the step. Make the master and I'll use the numbers.",
        proposals: [],
      };
    }
    return {
      provider: "rules",
      reply: pl
        ? `Przełączę cel na ${jobs[0]!.label.replace(/^Cel: /, "")}. Nie mam jeszcze pomiaru LUFS, więc nie podaję kroku w LU. Kliknij „Zastosuj”.`
        : `I'll switch the target to ${jobs[0]!.label.replace(/^Target: /, "")}. I don't have a LUFS measurement yet, so I won't quote a LU step. Hit Apply.`,
      proposals: [],
      jobs,
    };
  }
  const decision = resolveMasterLoudness({
    measuredLufs: measured,
    targetLufs: MASTER_TARGETS[id].lufs,
    truePeakDb: peak !== null && Number.isFinite(peak) ? peak : null,
    ceilingDb: MASTER_TARGETS[id].tp,
    currentOffset: ctx.master.settings.loudness,
    lang: ctx.lang,
    targetName: TARGET_NAME[ctx.lang][id],
  });
  const proposals = decision.changesKnob
    ? validateProposals([{ trackRef: BITEK_MASTER_REF, param: "loudness", value: decision.offset, label: "" }], ctx)
    : [];
  return {
    provider: "rules",
    reply: decision.reply,
    proposals,
    ...(jobs.length ? { jobs } : {}),
  };
}
