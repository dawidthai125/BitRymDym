/**
 * Human-facing Polish labels for UI.
 * Internal enums stay English in code/DB — only presentation maps here.
 */

export function labelAccountLevel(level: string): string {
  switch (level) {
    case "BEGINNER_RAPPER":
      return "Początkujący raper";
    case "PRO_RAPPER":
      return "Pro raper";
    case "LEGEND_RAPPER":
      return "Legenda";
    default:
      return "Twórca";
  }
}

export function labelTakeStatus(status: string): string {
  switch (status) {
    case "READY":
      return "Gotowe";
    case "EXPIRED":
      return "Wygasło";
    case "DELETED":
      return "Usunięte";
    case "PENDING_UPLOAD":
      return "W trakcie";
    case "FAILED":
      return "Nieudane";
    default:
      return "—";
  }
}

export function labelBeatStatus(status: string): string {
  switch (status) {
    case "PUBLISHED":
      return "Opublikowany";
    case "DRAFT":
      return "Szkic";
    case "PENDING_REVIEW":
      return "Do moderacji";
    case "APPROVED":
      return "Zaakceptowany";
    case "REJECTED":
      return "Odrzucony";
    case "ARCHIVED":
      return "Zarchiwizowany";
    default:
      return status;
  }
}

export function labelAudioReady(ready: boolean): string {
  return ready ? "Gotowy" : "Brak audio";
}

export function labelRecordingMode(mode: string): string {
  switch (mode) {
    case "QUICK_TAKE":
      return "Szybka próba";
    case "FULL_TAKE":
      return "Pełne nagranie";
    default:
      return "Nagranie";
  }
}
