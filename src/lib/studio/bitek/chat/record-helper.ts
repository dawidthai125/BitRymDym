import type { BitekChatContext, BitekChatResult, BitekLang } from "./types";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");

const CHANGE = /glosniej|ciszej|podglos|scisz|podkrec|\beq\b|kompres|panoram|\bpan\b|balans|master|stroj|autotun|wyrówn|wyrown|popraw/;

const T: Record<BitekLang, {
  defer: string;
  clip: (db: number) => string;
  quiet: (db: number) => string;
  idle: (withAudio: string[], empty: string[]) => string;
}> = {
  pl: {
    defer: "Przy nagraniu nie ruszam suwaków. Jak przejdziesz do mixu, poprawię to na ścieżkach, które naprawdę mają nagranie.",
    clip: (db) => `Widzę przester na wejściu (szczyt ${db} dB). Odsuń się trochę od mikrofonu. W mixie ściszę ścieżkę, jak klikniesz „Popraw w mixie”.`,
    quiet: (db) => `To wejście jest ciche (szczyt ${db} dB). Podejdź bliżej albo mów głośniej. W mixie podniosę wokal, jak klikniesz „Popraw w mixie”.`,
    idle: (withAudio, empty) => {
      if (!withAudio.length && !empty.length) return "Nie widzę jeszcze ścieżek. Dodaj bit albo nagraj wokal — w mixie wtedy pomogę.";
      const parts = [];
      if (withAudio.length) parts.push(`Z nagraniem: ${withAudio.join(", ")}.`);
      if (empty.length) parts.push(`Bez nagrania: ${empty.join(", ")}.`);
      parts.push("Suwaków tu nie ruszam. W mixie poprawimy poziomy razem.");
      return parts.join(" ");
    },
  },
  en: {
    defer: "I don't move faders while you're recording. In the mix I'll fix it on tracks that actually have audio.",
    clip: (db) => `The input is clipping (peak ${db} dB). Back off the mic a little. In the mix I'll turn the track down when you click “Fix in the mix”.`,
    quiet: (db) => `This input is quiet (peak ${db} dB). Move closer or speak up. In the mix I'll lift the vocal when you click “Fix in the mix”.`,
    idle: (withAudio, empty) => {
      if (!withAudio.length && !empty.length) return "I don't see any tracks yet. Add a beat or record a vocal — I'll help in the mix.";
      const parts = [];
      if (withAudio.length) parts.push(`With audio: ${withAudio.join(", ")}.`);
      if (empty.length) parts.push(`Empty: ${empty.join(", ")}.`);
      parts.push("I won't move faders here. We'll set levels together in the mix.");
      return parts.join(" ");
    },
  },
};

/** Recording stage: short, grounded, no mix/master actions. */
export function bitekRecordHelper(message: string, ctx: BitekChatContext): BitekChatResult {
  const tx = T[ctx.lang];
  const withAudio = ctx.tracks.filter((t) => t.hasAudio !== false).map((t) => t.name).filter(Boolean);
  const empty = ctx.tracks.filter((t) => t.hasAudio === false).map((t) => t.name).filter(Boolean);
  const level = ctx.takeLevel;
  const levelLine =
    level && (level.clipping || level.peakDb >= -1)
      ? tx.clip(Math.round(level.peakDb))
      : level && level.peakDb < -20
        ? tx.quiet(Math.round(level.peakDb))
        : "";
  if (CHANGE.test(norm(message))) {
    return { provider: "rules", reply: levelLine ? `${tx.defer} ${levelLine}` : tx.defer, proposals: [] };
  }
  return { provider: "rules", reply: levelLine || tx.idle(withAudio, empty), proposals: [] };
}
