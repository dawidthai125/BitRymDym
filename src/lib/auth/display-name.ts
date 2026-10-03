/**
 * ACCOUNT/PROFILE-01 — ksywka (display_name) validation (OD-ACCOUNT-02/11).
 * Pure helpers — no I/O.
 */

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 30;

/** Letters (incl. PL), digits, spaces, underscore, hyphen. */
const DISPLAY_NAME_RE = /^[\p{L}\p{N} _-]+$/u;

export type DisplayNameValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Normalize + validate ksywka.
 * Empty / whitespace-only / HTML / control chars → INVALID.
 */
export function validateDisplayName(
  raw: string | null | undefined,
): DisplayNameValidation {
  const value = String(raw ?? "").trim();
  if (!value) {
    return { ok: false, error: "Ksywka jest wymagana." };
  }
  if (value.length < DISPLAY_NAME_MIN) {
    return {
      ok: false,
      error: `Ksywka musi mieć co najmniej ${DISPLAY_NAME_MIN} znaki.`,
    };
  }
  if (value.length > DISPLAY_NAME_MAX) {
    return {
      ok: false,
      error: `Ksywka może mieć co najwyżej ${DISPLAY_NAME_MAX} znaków.`,
    };
  }
  // Reject angle brackets / obvious HTML and C0/C1 controls (except none — already trimmed).
  if (/[<>]/.test(value) || /[\u0000-\u001F\u007F-\u009F]/.test(value)) {
    return { ok: false, error: "Ksywka zawiera niedozwolone znaki." };
  }
  if (!DISPLAY_NAME_RE.test(value)) {
    return {
      ok: false,
      error:
        "Ksywka może zawierać litery, cyfry, spacje, podkreślenia i myślniki.",
    };
  }
  return { ok: true, value };
}

export const ANONYMIZED_PUBLIC_AUTHOR = "Usunięty użytkownik";
