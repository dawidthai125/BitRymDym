/**
 * Input the user (or an old tab) sent cannot be applied: HTTP 400, never retried by autosave.
 * The message is plain Polish — it is shown as it is.
 */
export class StudioValidationError extends Error {
  readonly code = "VALIDATION" as const;
  constructor(message: string) {
    super(message);
    this.name = "StudioValidationError";
  }
}

/** Pure Studio modules still throw plain errors for bad input. Known texts → Polish, everything else stays unknown. */
const VALIDATION_RULES: readonly (readonly [RegExp, string])[] = [
  [/^Clip exceeds project timeline length\.$/, "Klip nie mieści się w długości projektu."],
  [/^durationMs must be >= /, "Klip jest za krótki."],
  [/^Recorded duration must be at least|^durationSeconds must be/, "Nagranie jest za krótkie."],
  [/^sourceOffsetMs must be inside the recorded take\.$/, "Ten fragment jest poza nagraniem."],
  [/^playheadMs must be |^timelineStartMs must be |^sourceOffsetMs must be |^trimMs must be /, "Nieprawidłowe miejsce na osi. Odśwież projekt i spróbuj ponownie."],
  [/must be an integer number of milliseconds\.$|^timelineLengthMs must be /, "Nieprawidłowy czas na osi. Odśwież projekt i spróbuj ponownie."],
  [/ clip requires source|^Unknown clip sourceKind\.$/, "Nieprawidłowe źródło klipu."],
  [/^stretch (must be|out of range)|^pitchCents (must be|out of range)/, "Nieprawidłowe tempo albo wysokość klipu."],
  [/^pan must be finite\.$/, "Nieprawidłowe ustawienie lewo–prawo."],
  [/^TRACK_TYPE_INVALID$/, "Nieprawidłowy rodzaj ścieżki."],
  [/^Track not found in order list\.$/, "Ścieżka nie została znaleziona. Odśwież projekt."],
  [/^MARKERS_CAPACITY$/, "Masz już maksymalną liczbę znaczników."],
  [/^MARKER_NOT_FOUND$/, "Tego znacznika już nie ma. Odśwież projekt."],
  [/^MARKERS?_(KIND_|POSITION_|ID_)?INVALID$/, "Nieprawidłowy znacznik."],
  [/^expectedDocumentVersion /, "Projekt zmienił się w innym miejscu. Odśwież."],
];

/** Polish text for a validation failure, or null when the error is not one. */
export function studioValidationMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (error instanceof StudioValidationError) return error.message;
  // By name: these modules are also loaded in the browser and must not pull each other in.
  if (error.name === "AutomationValidationError" || error.name === "MidiValidationError") return error.message;
  if (error.name === "MixWorkingDomainError") return "Nieprawidłowa zmiana mixu. Odśwież projekt i spróbuj ponownie.";
  if (error instanceof SyntaxError) return "Nieprawidłowe żądanie.";
  const text = error.message.trim();
  for (const [rule, polish] of VALIDATION_RULES) if (rule.test(text)) return polish;
  // Plain Polish sentences are only written by our own input checks (Postgres and Supabase speak English).
  if (/[ąćęłńóśźż]/i.test(text) && !/^(Nie udało się|Projekt nie został zapisany)/.test(text) && !text.includes(" | ")) return text;
  return null;
}
