import "server-only";

import {
  DRUM_KITS,
  PLAY_MAX_LAYERS,
  PLAY_MAX_NOTES_PER_LAYER,
  sessionBeats,
  type PlayInstrumentId,
  type PlayLayer,
  type PlayNote,
  type PlaySession,
  type SampekResult,
} from "@/lib/studio/play/play-types";
import { detectKey, isDrumLayer, keyLabelPl } from "@/lib/studio/play/sampek-edit";
import { openAiCompatibleProvider, type BitekLlmProvider } from "@/lib/studio/bitek/chat/providers";

/**
 * Sampek AI ideas on the notes of a "Graj" recording. The model sees compact JSON and must
 * answer JSON; everything it returns is validated before it reaches the user.
 */

export const SAMPEK_AI_ACTIONS = ["chords", "bass", "counter", "variation"] as const;
export type SampekAiAction = (typeof SAMPEK_AI_ACTIONS)[number];

export class SampekAiError extends Error {}

type Env = Record<string, string | undefined>;

const BASS_INSTRUMENTS: readonly PlayInstrumentId[] = ["bass", "synth-bass"];
const COUNTER_INSTRUMENTS: readonly PlayInstrumentId[] = ["piano", "epiano", "guitar", "synth-lead", "synth-pad"];
const NOTE_RANGE = { min: 24, max: 96 };
const BASS_RANGE = { min: 28, max: 60 };

/** Same provider order as Bitek (xAI → Groq → Gemini), JSON mode, longer answers. */
export function sampekProviders(env: Env = process.env, fetchFn?: typeof fetch): BitekLlmProvider[] {
  const base = { maxTokens: 3000, temperature: 0.5, jsonMode: true, fetchFn };
  const list: BitekLlmProvider[] = [];
  const xai = env.XAI_API_KEY?.trim();
  const groq = env.GROQ_API_KEY?.trim();
  const gemini = env.GEMINI_API_KEY?.trim();
  if (xai) list.push(openAiCompatibleProvider({ ...base, id: "xai", baseUrl: "https://api.x.ai/v1", apiKey: xai, model: env.BITEK_XAI_MODEL || "grok-4.7", reasoningEffort: "low", timeoutMs: 25_000 }));
  if (groq) list.push(openAiCompatibleProvider({ ...base, id: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: groq, model: env.BITEK_GROQ_MODEL || "openai/gpt-oss-20b", reasoningEffort: "low", timeoutMs: 15_000 }));
  if (gemini) list.push(openAiCompatibleProvider({ ...base, id: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: gemini, model: env.BITEK_GEMINI_MODEL || "gemini-3.5-flash-lite", reasoningEffort: "low", timeoutMs: 25_000 }));
  return list;
}

const r16 = (x: number) => Math.round(x * 4) / 4;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Compact view for the model: notes as [start, length, midi, velocity], rounded to 1/16. */
export function compactSession(s: PlaySession): unknown {
  return {
    bpm: s.bpm,
    bars: s.bars,
    beats: sessionBeats(s),
    key: s.key ?? detectKey(s)?.key ?? null,
    layers: s.layers
      .filter((l) => !l.muted)
      .map((l) => ({
        id: l.id,
        instrument: l.instrument,
        drums: isDrumLayer(l),
        notes: l.notes.slice(0, 256).map((n) => [r16(n.t), Math.max(0.25, r16(n.d)), n.n, r2(n.v)]),
      })),
  };
}

/** Melodic layer the action works on: the asked one, else the busiest melodic layer. */
export function targetLayer(s: PlaySession, layerId?: string | null): PlayLayer | null {
  const melodic = s.layers.filter((l) => !isDrumLayer(l));
  if (layerId) return melodic.find((l) => l.id === layerId) ?? null;
  return [...melodic].sort((a, b) => b.notes.length - a.notes.length)[0] ?? null;
}

const TASK: Record<SampekAiAction, (target: PlayLayer) => string> = {
  chords: (t) =>
    `Fill out the harmony of layer "${t.id}": keep its existing notes and add chord tones under them (triads or seventh chords in the key, 2–4 voices, sensible voice leading, no clusters below MIDI 48). Return ONLY that layer with id "${t.id}" and its complete new note list.`,
  bass: () =>
    `Write a new bass line layer that follows the harmony of the existing melodic layers: roots and fifths on strong beats, some passing notes, rhythm that locks with the drums if any, MIDI ${BASS_RANGE.min}–${BASS_RANGE.max}. Return ONE new layer with id "sampek-bass" and instrument "bass" or "synth-bass".`,
  counter: () =>
    `Write a short counter-melody in a new layer that answers the main melody in the gaps (call and response), in the key, sparse, MIDI 55–84. Return ONE new layer with id "sampek-counter" and instrument one of piano, epiano, guitar, synth-lead, synth-pad.`,
  variation: (t) =>
    `Write a variation of layer "${t.id}": keep its character, rhythm feel and key, change about a third of the notes (ornaments, inversions, rhythmic displacement), same length. Return ONLY that layer with id "${t.id}".`,
};

export function sampekPrompt(s: PlaySession, action: SampekAiAction, target: PlayLayer): { role: "system" | "user"; content: string }[] {
  return [
    {
      role: "system",
      content: [
        "You are Sampek, a hip-hop sample producer's assistant. You edit MIDI-like note data of a short loop.",
        "Time is in beats (quarter notes) from the loop start; every note is [start, length, midi, velocity 0-1].",
        "Starts must be >= 0 and < beats; start + length <= beats; quantize to 1/16 (multiples of 0.25) unless the input swings.",
        `At most ${PLAY_MAX_NOTES_PER_LAYER} notes per layer. Never name artists or songs.`,
        'Reply with JSON only: {"layers":[{"id":"...","instrument":"...","notes":[[start,length,midi,velocity],...]}],"changes":["..."]}.',
        "changes: 1 to 3 short lines in Polish, plain words, saying what you did musically (e.g. which chords).",
      ].join(" "),
    },
    { role: "user", content: `${TASK[action](target)}\nLoop:\n${JSON.stringify(compactSession(s))}` },
  ];
}

function parseJson(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const m = /\{[\s\S]*\}/.exec(t);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function cleanNotes(raw: unknown, beats: number, range: { min: number; max: number }): PlayNote[] | null {
  if (!Array.isArray(raw)) return null;
  const notes: PlayNote[] = [];
  for (const item of raw) {
    const arr = Array.isArray(item)
      ? item
      : item && typeof item === "object"
        ? [(item as PlayNote).t, (item as PlayNote).d, (item as PlayNote).n, (item as PlayNote).v]
        : null;
    if (!arr || arr.length < 3) continue;
    const t = Number(arr[0]);
    let d = Number(arr[1]);
    const n = Math.round(Number(arr[2]));
    const v = arr.length > 3 ? Number(arr[3]) : 0.8;
    if (![t, d, n, v].every(Number.isFinite)) continue;
    if (t < 0 || t >= beats || n < range.min || n > range.max) continue;
    d = Math.min(Math.max(d, 0.125), beats - t);
    notes.push({ t: Math.round(t * 1000) / 1000, d: Math.round(d * 1000) / 1000, n, v: Math.min(1, Math.max(0.05, v)) });
    if (notes.length >= PLAY_MAX_NOTES_PER_LAYER) break;
  }
  return notes.length ? notes.sort((a, b) => a.t - b.t || a.n - b.n) : null;
}

/** Apply a validated model answer to the session. Null when nothing usable came back. */
export function applyModelAnswer(
  s: PlaySession,
  action: SampekAiAction,
  target: PlayLayer,
  answer: unknown,
): SampekResult | null {
  if (!answer || typeof answer !== "object") return null;
  const a = answer as { layers?: unknown; changes?: unknown };
  if (!Array.isArray(a.layers) || !a.layers.length) return null;
  const beats = sessionBeats(s);
  const first = a.layers[0] as { id?: unknown; instrument?: unknown; notes?: unknown };
  const changes = (Array.isArray(a.changes) ? a.changes : [])
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.replace(/\s+/g, " ").trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 3);
  const next: PlaySession = { ...s, layers: s.layers.map((l) => ({ ...l, notes: [...l.notes] })) };

  if (action === "chords" || action === "variation") {
    const notes = cleanNotes(first.notes, beats, NOTE_RANGE);
    if (!notes) return null;
    if (action === "chords" && notes.length <= target.notes.length) return null;
    next.layers = next.layers.map((l) => (l.id === target.id ? { ...l, notes } : l));
    const fallback =
      action === "chords"
        ? `Dopełniłem akordy w warstwie: ${target.notes.length} → ${notes.length} nut.`
        : `Zrobiłem wariant warstwy (${notes.length} nut).`;
    return { session: next, changes: changes.length ? changes : [fallback] };
  }

  if (next.layers.length >= PLAY_MAX_LAYERS) return null;
  const allowed = action === "bass" ? BASS_INSTRUMENTS : COUNTER_INSTRUMENTS;
  const instrument = allowed.includes(first.instrument as PlayInstrumentId) ? (first.instrument as PlayInstrumentId) : allowed[0]!;
  const notes = cleanNotes(first.notes, beats, action === "bass" ? BASS_RANGE : { min: 48, max: 90 });
  if (!notes) return null;
  let id = action === "bass" ? "sampek-bass" : "sampek-counter";
  let i = 2;
  while (next.layers.some((l) => l.id === id)) id = `${action === "bass" ? "sampek-bass" : "sampek-counter"}-${i++}`;
  next.layers.push({ id, instrument, notes, gain: action === "bass" ? 0.9 : 0.7 });
  const fallback = action === "bass" ? `Dodałem linię basu (${notes.length} nut).` : `Dodałem kontrmelodię (${notes.length} nut).`;
  return { session: next, changes: changes.length ? changes : [fallback] };
}

export async function runSampekAi(
  s: PlaySession,
  action: SampekAiAction,
  layerId?: string | null,
  deps: { env?: Env; fetchFn?: typeof fetch; providers?: BitekLlmProvider[] } = {},
): Promise<SampekResult> {
  const target = targetLayer(s, layerId);
  if (!target || target.notes.length === 0) {
    throw new SampekAiError("Najpierw nagraj coś na instrumencie melodycznym (klawisze, gitara, syntezator). Same bębny Sampkowi nie wystarczą.");
  }
  if ((action === "bass" || action === "counter") && s.layers.length >= PLAY_MAX_LAYERS) {
    throw new SampekAiError(`Masz już ${PLAY_MAX_LAYERS} warstw. Usuń jedną, żeby Sampek mógł dodać nową.`);
  }
  const key = s.key ?? detectKey(s)?.key ?? null;
  const withKey: PlaySession = key ? { ...s, key } : s;
  const providers = deps.providers ?? sampekProviders(deps.env, deps.fetchFn);
  if (!providers.length) throw new SampekAiError("Sampek nie ma teraz połączenia z AI. Poprawki bez AI działają dalej.");
  const prompt = sampekPrompt(withKey, action, target);
  for (const provider of providers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), provider.timeoutMs);
    try {
      const raw = await provider.complete(prompt, controller.signal);
      const result = applyModelAnswer(withKey, action, target, parseJson(raw));
      if (result) {
        if (key && !s.key) result.changes.unshift(`Tonacja: ${keyLabelPl(key)}.`);
        return result;
      }
      console.error("[sampek] unusable answer", provider.id);
    } catch (error) {
      console.error("[sampek] provider failed", provider.id, error instanceof Error ? error.message : "unknown");
    } finally {
      clearTimeout(timer);
    }
  }
  throw new SampekAiError("Sampek nie dał rady tym razem: AI oddało nuty, których nie dało się użyć. Spróbuj jeszcze raz.");
}

export function isSampekAiAction(v: unknown): v is SampekAiAction {
  return typeof v === "string" && (SAMPEK_AI_ACTIONS as readonly string[]).includes(v);
}

/** Drum kits are never targets; exported for the route's checks. */
export const SAMPEK_DRUM_KITS = DRUM_KITS;
