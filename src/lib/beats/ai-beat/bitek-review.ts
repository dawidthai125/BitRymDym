import { levelFactLines } from "@/lib/beats/ai-beat/level";
import {
  BEAT_DESCRIPTION_MAX,
  BEAT_DURATION_CHOICES,
  DEFAULT_BEAT_DURATION,
  normalizeBeatDescription,
  type BeatDuration,
} from "@/lib/beats/ai-beat/prompt";

export const BITEK_REVIEW_SYSTEM = [
  "Jesteś Bitkiem, technicznym asystentem BitRymDym.",
  "Odpowiadasz po polsku, krótko, tylko na podstawie podanych faktów.",
  "Nie twierdzisz, że słyszysz stopę, fortepian, przestrzeń ani żaden instrument.",
  "Szczyt i średnia w decybelach to pomiar pliku. Nie zamieniaj ich na nazwy instrumentów.",
  "Odpowiadasz na ostatnią uwagę rozmówcy, nie powtarzasz poprzedniej odpowiedzi. Nie otwierasz linków. Gdy proszą o poprawę (np. więcej energii), napisz jedno zdanie, co zmienić w opisie.",
  "Nie twierdzisz, że plik jest już gotowy.",
].join(" ");

const MESSAGE_MAX = 8;
const MESSAGE_CHARS = 500;

export type BitekBeatFacts = {
  title: string;
  style: string | null;
  opis: string | null;
  bpm: number | null;
  durationSeconds: number | null;
  peakDb?: number | null;
  rmsDb?: number | null;
};

export type BitekChatTurn = {
  role: "user" | "assistant";
  content: string;
};

function oneLine(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

/** Facts Bitek may cite. Nothing here is a claim about how the file sounds. */
export function bitekFactsLines(facts: BitekBeatFacts): string[] {
  const title = oneLine(facts.title) || "Bit";
  const style = oneLine(facts.style);
  const opis = oneLine(facts.opis);
  const bpm =
    typeof facts.bpm === "number" && Number.isInteger(facts.bpm) && facts.bpm > 0
      ? `Tempo: ${facts.bpm} BPM.`
      : "Tempo: niezmierzony.";
  const duration =
    typeof facts.durationSeconds === "number" &&
    Number.isFinite(facts.durationSeconds) &&
    facts.durationSeconds > 0
      ? `Długość: ${Math.round(facts.durationSeconds)} s.`
      : "Długość: nieznana.";
  return [
    `Tytuł: ${title}`,
    style ? `Styl: ${style}` : "Styl: brak zapisanego stylu.",
    opis ? `Opis: ${opis}` : "Opis: brak zapisanego opisu.",
    bpm,
    duration,
    ...levelFactLines(facts.peakDb, facts.rmsDb),
  ];
}

/** Last eight non-empty turns. Roles other than user or assistant are dropped. */
export function sliceBitekMessages(raw: unknown): BitekChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: BitekChatTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const text = content.replace(/\s+/g, " ").trim().slice(0, MESSAGE_CHARS);
    if (!text) continue;
    turns.push({ role, content: text });
  }
  return turns.slice(-MESSAGE_MAX);
}

/**
 * Next generator description. The old draft stays; this text starts a new one.
 * Null when the note is empty or the result cannot be a beat description.
 */
export function revisionDescription(opis: string | null, note: string): string | null {
  const cleanNote = oneLine(note);
  if (!cleanNote) return null;
  const base = oneLine(opis);
  const joined = `${base} Poprawka: ${cleanNote}`.replace(/\s+/g, " ").trim();
  return normalizeBeatDescription(joined.slice(0, BEAT_DESCRIPTION_MAX));
}

/** Generator lengths are 90, 120, 150 and 180. Other files snap to the nearest. */
export function nearestBeatDuration(seconds: number | null): BeatDuration {
  if (seconds == null || !Number.isFinite(seconds)) return DEFAULT_BEAT_DURATION;
  let best: BeatDuration = DEFAULT_BEAT_DURATION;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const choice of BEAT_DURATION_CHOICES) {
    const gap = Math.abs(choice - seconds);
    if (gap < bestGap) {
      best = choice;
      bestGap = gap;
    }
  }
  return best;
}
