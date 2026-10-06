/**
 * Human-facing Polish labels for UI (POLISH-01 SSOT).
 * Internal enums stay English in code/DB — only presentation maps here.
 *
 * OD-PL locked:
 * - OD-PL-03 Premium tiers: Free / Bronze / Silver / Gold (KEEP EN product language)
 * - OD-PL-04 PENDING_REVIEW → "W moderacji"
 * - OD-PL-05 Studio KEEP EN (nav/brand — not labeled here)
 * - OD-PL-06 Master KEEP EN Title Case
 * - Beat DRAFT → "Wersja robocza" · APPROVED → "Zatwierdzone" (Owner GO Wave B)
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

/** Canonical beat lifecycle status labels (POLISH-01). */
export function labelBeatStatus(status: string): string {
  switch (status) {
    case "PUBLISHED":
      return "Opublikowany";
    case "DRAFT":
      return "Wersja robocza";
    case "PENDING_REVIEW":
      return "W moderacji";
    case "APPROVED":
      return "Zatwierdzone";
    case "REJECTED":
      return "Odrzucony";
    case "ARCHIVED":
      return "Zarchiwizowany";
    default:
      return "—";
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

export function labelAdminAuditAction(action: string): string {
  switch (action) {
    case "ROLE_CHANGE":
      return "Zmiana roli";
    case "ADMIN_GRANT":
      return "Nadanie roli administratora";
    case "ADMIN_REVOKE":
      return "Odebranie roli administratora";
    case "MODERATOR_GRANT":
      return "Nadanie roli moderatora";
    case "MODERATOR_REVOKE":
      return "Odebranie roli moderatora";
    case "PREMIUM_TIER_CHANGE":
      return "Zmiana Premium";
    case "PREMIUM_EXPIRATION_CHANGE":
      return "Zmiana daty wygaśnięcia";
    case "USER_ACCOUNT_DELETE":
      return "Usunięcie konta";
    case "SAMPLE_POLICY_UPDATE":
      return "Aktualizacja polityki nagrań";
    default:
      return "—";
  }
}

/** OD-PL-03 — Premium product language stays English Title Case. */
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

/** Beat ownership_type presentation (PLATFORM / USER). */
export function labelBeatOwnership(ownership: string): string {
  switch (ownership) {
    case "PLATFORM":
      return "bit platformowy";
    case "USER":
      return "bit użytkownika";
    default:
      return "—";
  }
}

/**
 * Sample-policy actor presentation (OD-PL-01 C / OD-PL-02).
 * ANONYMOUS → Gość; Premium tiers via labelPremiumTier.
 */
export function labelSamplePolicyActor(actor: string): string {
  if (actor === "ANONYMOUS") return "Gość";
  return labelPremiumTier(actor);
}

/** P5 Studio track_type presentation (controls PL; enums stay EN). */
export function labelStudioTrackType(trackType: string): string {
  switch (trackType) {
    case "VOCAL":
      return "Wokal";
    case "BEAT":
      return "Bit";
    case "SAMPLE":
      return "Sample";
    case "SCRATCH":
      return "Scratch";
    case "INSTRUMENT":
      return "Instrument";
    case "GUITAR":
      return "Gitara";
    case "FX":
      return "Efekty";
    case "BUS":
      return "Szyna";
    case "OTHER":
      return "Inna";
    default:
      return "Ścieżka";
  }
}
