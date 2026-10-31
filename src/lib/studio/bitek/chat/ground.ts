import { validateBitekJobs } from "./jobs";
import type { BitekChatContext, BitekChatResult, BitekLang } from "./types";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");

type RoleCheck = { roles: string[]; re: RegExp; absent: Record<BitekLang, string>; empty: Record<BitekLang, string> };

const CHECKS: readonly RoleCheck[] = [
  {
    roles: ["lead_vocal"],
    re: /wokal|vocal|\bvoice\b|glos(?!n)/,
    absent: {
      pl: "Nie widzę jeszcze ścieżki wokalu z nagraniem. Nagraj ją, a w mixie podgłośnię — teraz nie ruszam czegoś, czego nie ma.",
      en: "I don't see a vocal track with audio yet. Record it first and I'll lift it in the mix — I won't touch something that isn't there.",
    },
    empty: {
      pl: "Ścieżka wokalu jest pusta — nie ma na niej nagrania. Nagraj ją, a poprawimy poziom w mixie.",
      en: "The vocal track is empty — nothing is recorded on it. Record it, then we'll set the level in the mix.",
    },
  },
  {
    roles: ["adlib", "double", "backing"],
    re: /adlib|ad-lib|dogryw|backing|double/,
    absent: {
      pl: "Nie widzę adlibów ani dogrywek z nagraniem. Dodaj taką ścieżkę, wtedy rozłożę ją w mixie.",
      en: "I don't see ad-libs or doubles with audio. Add that track and I'll place it in the mix.",
    },
    empty: {
      pl: "Ścieżka adlibu jest pusta. Nagraj ją, zanim cokolwiek na niej ustawię.",
      en: "The ad-lib track is empty. Record it before I change anything on it.",
    },
  },
  {
    roles: ["beat", "instrument"],
    re: /\bbit\b|\bbeat\b|podklad|instrumental/,
    absent: {
      pl: "Nie widzę bitu ani podkładu w tym projekcie. Wgraj bit, wtedy mogę go ściszyć albo podgłośnić.",
      en: "I don't see a beat or instrumental in this project. Add one and then I can turn it up or down.",
    },
    empty: {
      pl: "Ścieżka bitu jest pusta — nie ma na niej audio. Wgraj bit, zanim ruszę jego głośność.",
      en: "The beat track is empty — there's no audio on it. Add the beat before I change its level.",
    },
  },
];

function audioState(ctx: BitekChatContext, roles: string[]): "audio" | "empty" | "absent" {
  const rows = ctx.tracks.filter((t) => roles.includes(t.role));
  if (rows.some((t) => t.hasAudio !== false)) return "audio";
  if (rows.length > 0) return "empty";
  return "absent";
}

/** Reply names a role that has no usable audio. Null when the reply stays inside the project. */
export function missingRoleInReply(reply: string, ctx: BitekChatContext): { message: string } | null {
  if (ctx.step === "master") return null;
  const m = norm(reply);
  for (const check of CHECKS) {
    if (!check.re.test(m)) continue;
    const state = audioState(ctx, check.roles);
    if (state === "audio") continue;
    return { message: check[state][ctx.lang] };
  }
  return null;
}

/** Strip actions the project cannot support and replace a reply that invents a track. */
export function groundBitekResult(result: BitekChatResult, ctx: BitekChatContext): BitekChatResult {
  const jobs = validateBitekJobs(result.jobs ?? [], ctx);
  if (ctx.step === "record") {
    return { provider: result.provider, reply: result.reply, proposals: [], ...(result.relative ? { relative: result.relative } : {}) };
  }
  let proposals = result.proposals.filter((p) => {
    if (p.trackRef === "master") return ctx.step === "master";
    const track = ctx.tracks.find((t) => t.ref === p.trackRef);
    return Boolean(track) && track!.hasAudio !== false;
  });
  let reply = result.reply;
  const missing = missingRoleInReply(reply, ctx);
  if (missing) {
    reply = missing.message;
    proposals = [];
    return {
      provider: result.provider,
      reply,
      proposals,
      ...(result.backToMix ? { backToMix: true } : {}),
      ...(result.relative ? { relative: result.relative } : {}),
    };
  }
  return {
    provider: result.provider,
    reply,
    proposals,
    ...(jobs.length ? { jobs } : {}),
    ...(result.backToMix ? { backToMix: true } : {}),
    ...(result.relative ? { relative: result.relative } : {}),
  };
}
