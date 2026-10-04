export const ADMIN_USERS_DELETE_CODES = [
  "ADMIN_FORBIDDEN",
  "TARGET_NOT_FOUND",
  "LAST_ADMIN_PROTECTED",
  "SELF_DELETE_FORBIDDEN",
  "INVALID_DELETE_REASON",
  "DELETE_FAILED",
  "AUDIT_FAILED",
  "EMAIL_NOTIFICATION_FAILED",
  "MUTATION_FAILED",
] as const;

export type AdminUsersDeleteCode = (typeof ADMIN_USERS_DELETE_CODES)[number];

const POLISH: Record<AdminUsersDeleteCode, string> = {
  ADMIN_FORBIDDEN: "Brak uprawnień do usunięcia użytkownika.",
  TARGET_NOT_FOUND: "Nie znaleziono użytkownika.",
  LAST_ADMIN_PROTECTED: "Nie można usunąć ostatniego administratora.",
  SELF_DELETE_FORBIDDEN:
    "Nie możesz usunąć własnego konta z panelu administratora.",
  INVALID_DELETE_REASON: "Podaj powód usunięcia (10–500 znaków, bez HTML).",
  DELETE_FAILED: "Nie udało się usunąć konta.",
  AUDIT_FAILED:
    "Konto zostało usunięte. Nie udało się zapisać wpisu w historii.",
  EMAIL_NOTIFICATION_FAILED:
    "Konto zostało usunięte. Nie udało się wysłać powiadomienia e-mail.",
  MUTATION_FAILED: "Nie udało się usunąć konta.",
};

export function polishAdminUsersDeleteError(code: AdminUsersDeleteCode): string {
  return POLISH[code];
}

export function parseAdminUsersDeleteErrorCode(
  raw: string | null | undefined,
): AdminUsersDeleteCode {
  const text = raw ?? "";
  for (const code of ADMIN_USERS_DELETE_CODES) {
    if (text.includes(code)) return code;
  }
  return "MUTATION_FAILED";
}
