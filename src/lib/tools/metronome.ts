/** Metronome tempo field (pure). */
export const TEMPO_MIN = 30;
export const TEMPO_MAX = 300;

export const clampTempo = (n: number) => Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(n)));

/** Tempo of a text still being typed: only a finished value in range ("9" on the way to "90" is not one). */
export function draftTempo(text: string): number | null {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) && n >= TEMPO_MIN && n <= TEMPO_MAX ? Math.round(n) : null;
}

/** Tempo when the field is left: clamped; unreadable text keeps the current tempo. */
export function commitTempo(text: string, current: number): number {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) ? clampTempo(n) : current;
}
