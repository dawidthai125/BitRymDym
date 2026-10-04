export const ADMIN_USERS_MUTATION_CODES = [
  "ADMIN_FORBIDDEN",
  "TARGET_NOT_FOUND",
  "LAST_ADMIN_PROTECTED",
  "SELF_DEMOTION_FORBIDDEN",
  "INVALID_PREMIUM_TIER",
  "INVALID_ROLE",
  "INVALID_EXPIRATION",
  "NO_CHANGES",
  "AUDIT_FAILED",
  "MUTATION_FAILED",
] as const;

export type AdminUsersMutationCode =
  (typeof ADMIN_USERS_MUTATION_CODES)[number];

const POLISH: Record<AdminUsersMutationCode, string> = {
  ADMIN_FORBIDDEN: "Brak uprawnień do zmiany użytkowników.",
  TARGET_NOT_FOUND: "Nie znaleziono użytkownika.",
  LAST_ADMIN_PROTECTED: "Nie można zdegradować ostatniego administratora.",
  SELF_DEMOTION_FORBIDDEN: "Nie możesz zmienić własnej roli.",
  INVALID_PREMIUM_TIER: "Nieprawidłowy plan Premium.",
  INVALID_ROLE: "Nieprawidłowa rola.",
  INVALID_EXPIRATION: "Nieprawidłowa data wygaśnięcia.",
  NO_CHANGES: "Brak zmian.",
  AUDIT_FAILED: "Nie udało się zapisać zmian.",
  MUTATION_FAILED: "Nie udało się zapisać zmian.",
};

export function polishAdminUsersMutationError(
  code: AdminUsersMutationCode,
): string {
  return POLISH[code];
}

export function parseAdminUsersMutationErrorCode(
  raw: string | null | undefined,
): AdminUsersMutationCode {
  const text = raw ?? "";
  for (const code of ADMIN_USERS_MUTATION_CODES) {
    if (text.includes(code)) return code;
  }
  return "MUTATION_FAILED";
}
