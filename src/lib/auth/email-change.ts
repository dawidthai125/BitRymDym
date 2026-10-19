/**
 * ACCT-EMAIL-01 — email change stays on Supabase Auth.
 * No profiles.email column and no parallel token table.
 *
 * Product rule: the change is finished only after both the current and the
 * new address confirm. GoTrue does that when Secure email change is enabled
 * (SDK default). This module does not read or change that project setting.
 * `product_success` is returned only when the caller passes the flag as true
 * AND Auth no longer has a pending `new_email`.
 */

import { assertDeleteTargetsSessionUser } from "@/lib/auth/delete-account-policy";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMAIL_CHANGE_AWAITING_MESSAGE =
  "Prośba wysłana. Adres logowania jeszcze się nie zmienił. Potwierdź wiadomość na obecnej i na nowej skrzynce.";

export const EMAIL_CHANGE_START_FAILED =
  "Nie udało się rozpocząć zmiany adresu. Sprawdź dane i spróbuj ponownie.";

export const EMAIL_CHANGE_PARTIAL_MESSAGE =
  "Jest jedno potwierdzenie. Adres logowania jeszcze się nie zmienił. Dokończ wiadomość na drugiej skrzynce.";

export const EMAIL_CHANGE_AUTH_FINISHED_UNVERIFIED_MESSAGE =
  "Ten link został przyjęty. Stąd nie widać, czy obie skrzynki już potwierdziły. Sprawdź adres logowania na koncie — sam link nie jest dowodem, że zmiana się skończyła.";

export const EMAIL_CHANGE_PRODUCT_SUCCESS_MESSAGE =
  "Adres e-mail został zmieniony po potwierdzeniu obecnej i nowej skrzynki.";

export const EMAIL_CHANGE_INVALID_LINK_MESSAGE =
  "Link zmiany adresu jest nieprawidłowy lub wygasł. Uruchom zmianę ponownie z konta.";

export function normalizeEmailAddress(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function validateEmailAddress(
  raw: string | null | undefined,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = normalizeEmailAddress(raw);
  if (!value) {
    return { ok: false, error: "Podaj adres e-mail." };
  }
  if (value.length > 254 || !EMAIL_RE.test(value)) {
    return { ok: false, error: "Podaj prawidłowy adres e-mail." };
  }
  return { ok: true, value };
}

export type EmailChangeRequestResult =
  | { ok: false; started: false; error: string }
  | {
      ok: true;
      started: true;
      phase: "awaiting_confirmation";
      message: string;
    };

/**
 * Session identity only. Reauth runs before any Auth email mutation.
 * A failed reauth must not call `startAuthEmailChange`.
 */
export async function requestEmailChange(params: {
  sessionUserId: string | null;
  sessionEmail: string | null;
  newEmail: string;
  confirmEmail: string;
  currentPassword: string;
  claimedUserId?: string | null;
  claimedUserNumber?: string | null;
  reauthenticate: (
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  startAuthEmailChange: (email: string) => Promise<{ errorMessage: string | null }>;
}): Promise<EmailChangeRequestResult> {
  if (!params.sessionUserId) {
    return { ok: false, started: false, error: "Wymagane zalogowanie." };
  }

  assertDeleteTargetsSessionUser({
    sessionUserId: params.sessionUserId,
    claimedUserId: params.claimedUserId,
    claimedUserNumber: params.claimedUserNumber,
    claimedEmail: null,
  });

  const next = validateEmailAddress(params.newEmail);
  if (!next.ok) {
    return { ok: false, started: false, error: next.error };
  }
  const confirm = validateEmailAddress(params.confirmEmail);
  if (!confirm.ok) {
    return { ok: false, started: false, error: confirm.error };
  }
  if (next.value !== confirm.value) {
    return {
      ok: false,
      started: false,
      error: "Podane adresy e-mail nie są zgodne.",
    };
  }

  const current = normalizeEmailAddress(params.sessionEmail);
  if (!current) {
    return {
      ok: false,
      started: false,
      error: "Nie można odczytać obecnego adresu z sesji.",
    };
  }
  if (next.value === current) {
    return {
      ok: false,
      started: false,
      error: "Podaj adres inny niż obecny.",
    };
  }

  const reauth = await params.reauthenticate(params.currentPassword);
  if (!reauth.ok) {
    return { ok: false, started: false, error: reauth.error };
  }

  const started = await params.startAuthEmailChange(next.value);
  if (started.errorMessage) {
    return { ok: false, started: false, error: EMAIL_CHANGE_START_FAILED };
  }

  return {
    ok: true,
    started: true,
    phase: "awaiting_confirmation",
    message: EMAIL_CHANGE_AWAITING_MESSAGE,
  };
}

export type EmailChangeOutcome =
  | "awaiting_other"
  | "auth_finished_config_unverified"
  | "product_success";

/**
 * `secureEmailChangeEnabled: null` means the project flag was not read.
 * That path must not report product success.
 */
export function resolveEmailChangeOutcome(params: {
  secureEmailChangeEnabled: boolean | null;
  pendingNewEmail: string | null | undefined;
}): EmailChangeOutcome {
  const pending = normalizeEmailAddress(params.pendingNewEmail);
  if (pending) return "awaiting_other";
  if (params.secureEmailChangeEnabled === true) return "product_success";
  return "auth_finished_config_unverified";
}

export type EmailChangeLanding = "invalid" | "error" | "partial" | "auth_finished";

/**
 * After an email-change verify. This path never reports product success.
 * A successful verify with no user is the first of two secure-email
 * confirmations: GoTrue returns 200 without a session. That is partial,
 * not a dead link and not a finished change.
 */
export function emailChangeLandingAfterVerify(params: {
  exchangeOk: boolean;
  userError: boolean;
  user: { new_email?: string | null } | null;
}): EmailChangeLanding {
  if (!params.exchangeOk) return "invalid";
  if (params.userError || params.user == null) return "partial";
  const outcome = resolveEmailChangeOutcome({
    secureEmailChangeEnabled: null,
    pendingNewEmail: params.user.new_email,
  });
  return outcome === "awaiting_other" ? "partial" : "auth_finished";
}

export function emailChangeAccountPath(
  phase: "partial" | "invalid" | "auth_finished" | "error",
): string {
  return `/account?emailChange=${phase}`;
}
