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

export function labelSystemRole(role: string): string {
  switch (role) {
    case "ADMIN":
      return "Administrator";
    case "MODERATOR":
      return "Moderator";
    case "USER":
      return "Użytkownik";
    default:
      return "Użytkownik";
  }
}

export function labelCreatorRank(rank: string): string {
  switch (rank) {
    case "BEGINNER_RAPPER":
      return "Początkujący";
    case "ROOKIE_RAPPER":
      return "Nowicjusz";
    case "RISING_RAPPER":
      return "Wschodzący";
    case "PRO_RAPPER":
      return "Pro";
    case "ELITE_RAPPER":
      return "Elita";
    case "LEGEND_RAPPER":
      return "Legenda";
    default:
      return "Początkujący";
  }
}

export function labelPremiumTier(tier: string): string {
  switch (tier) {
    case "FREE":
      return "Free";
    case "BRONZE":
      return "Bronze";
    case "SILVER":
      return "Silver";
    case "GOLD":
      return "Gold";
    default:
      return "Free";
  }
}

export function labelAudioReady(ready: boolean): string {
  return ready ? "Gotowy" : "Brak audio";
}

export function labelRecordingMode(mode: string): string {
  switch (mode) {
    case "QUICK_TAKE":
      return "Szybkie nagranie";
    case "FULL_TAKE":
      return "Pełne nagranie";
    default:
      return "Nagranie";
  }
}
