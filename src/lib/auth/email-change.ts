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

export const EMAIL_CHANGE_PRODUCT_SUCCESS_MESSAGE =
  "Adres e-mail został zmieniony po potwierdzeniu obecnej i nowej skrzynki.";

/** Shown after the callback has classified the verify result. Not inferred from the URL. */
export const EMAIL_CHANGE_NOTICE_COPY = {
  one: {
    title: "Pierwszy e-mail potwierdzony",
    body: "Potwierdzenie 1 z 2 zostało przyjęte. Dokończ proces, potwierdzając drugi e-mail. Damy Ci znać, gdy zmiana adresu zostanie zakończona.",
  },
  both: {
    title: "Adres e-mail został zmieniony!",
    body: "Oba potwierdzenia zostały przyjęte. Twój adres e-mail został pomyślnie zaktualizowany. Możesz wrócić do swojego konta.",
  },
  invalid: {
    title: "Nie udało się potwierdzić adresu",
    body: "Link jest nieprawidłowy lub wygasł. Wróć do konta i sprawdź aktualny stan zmiany adresu.",
  },
  unknown: {
    title: "Sprawdzamy status zmiany adresu",
    body: "Nie możemy jeszcze potwierdzić zakończenia zmiany. Sprawdź aktualny adres w ustawieniach konta, zanim rozpoczniesz kolejną próbę.",
  },
} as const;

export type EmailChangeNoticeStatus = keyof typeof EMAIL_CHANGE_NOTICE_COPY;

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
 *
 * Public `GET /auth/v1/settings` does not carry Secure email change.
 * `mailer_autoconfirm` and `external.email` are other switches.
 * Only an explicit boolean field would count, and that field is absent.
 */
/**
 * Owner attestation of the Dashboard switch, read only on the server.
 * `on` and `off` are the only accepted values. Anything else, including
 * unset, stays unknown so a typo cannot turn on the 2/2 message.
 * This is not a live read of GoTrue. The second verify returns a normal
 * session both when dual confirmation finishes and when the switch is off,
 * so the session alone is not proof of both mailboxes.
 */
export function parseSecureEmailChangeAttestation(
  raw: string | null | undefined,
): boolean | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}

export function secureEmailChangeFromPublicAuthSettings(
  settings: unknown,
): boolean | null {
  if (!settings || typeof settings !== "object") return null;
  const record = settings as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, "mailer_secure_email_change_enabled")) {
    return null;
  }
  const value = record.mailer_secure_email_change_enabled;
  return typeof value === "boolean" ? value : null;
}

export function resolveEmailChangeOutcome(params: {
  secureEmailChangeEnabled: boolean | null;
  pendingNewEmail: string | null | undefined;
}): EmailChangeOutcome {
  const pending = normalizeEmailAddress(params.pendingNewEmail);
  if (pending) return "awaiting_other";
  if (params.secureEmailChangeEnabled === true) return "product_success";
  return "auth_finished_config_unverified";
}

export type EmailChangeVerifySnapshot = {
  exchangeOk: boolean;
  /** OTP token_hash is the email template contract. PKCE is not proof of 1/2. */
  verifyTransport: "otp" | "pkce";
  /** This verify response included a session access token. */
  verifyIssuedSession: boolean;
  /** This verify response included a user. Distinct from a later getUser(). */
  verifyReturnedUser: boolean;
  /** Account read after verify. Null when there is no session to read. */
  user: { email?: string | null; new_email?: string | null } | null;
  /**
   * Runtime knowledge of Secure email change.
   * Null means the flag was not read. That must not become 2/2.
   */
  secureEmailChangeEnabled: boolean | null;
};

/**
 * Classify one email-change verify.
 *
 * 1/2: an email-change OTP verify succeeded with no user and no session.
 * auth-js documents that shape as the secure-email first confirmation.
 * A readable `new_email` is also 1/2. PKCE without a session is not.
 * 2/2: this verify issued a session, the readable user has an email and no
 * pending `new_email`, and the caller proved Secure email change is on.
 * A missing `new_email` without that proof stays unknown.
 * Failed or expired verify is invalid. It is never 1/2 or 2/2.
 */
export function classifyEmailChangeVerification(
  params: EmailChangeVerifySnapshot,
): EmailChangeNoticeStatus {
  if (!params.exchangeOk) return "invalid";

  const pending = normalizeEmailAddress(params.user?.new_email);
  if (pending) return "one";

  const firstAcknowledgement =
    params.verifyTransport === "otp" &&
    !params.verifyIssuedSession &&
    !params.verifyReturnedUser;
  if (!params.user) {
    return firstAcknowledgement ? "one" : "unknown";
  }

  if (firstAcknowledgement) return "unknown";

  const email = normalizeEmailAddress(params.user.email);
  if (
    params.verifyIssuedSession &&
    params.secureEmailChangeEnabled === true &&
    email
  ) {
    return "both";
  }
  return "unknown";
}

/**
 * What the account or result page may show.
 * A URL query is not an input. `new_email` alone is not 1/2: it is set when
 * the change is requested, before either mailbox confirms.
 * 1/2 requires the signed callback notice. A readable session must still
 * have `new_email`, otherwise the notice is no longer 1/2.
 * 2/2 requires the signed notice plus a readable session that is not waiting.
 */
export function resolveEmailChangeNoticeDisplay(params: {
  signedStatus: EmailChangeNoticeStatus | null;
  pendingNewEmail: string | null | undefined;
  sessionReadable: boolean;
}): EmailChangeNoticeStatus | null {
  const pending = Boolean(normalizeEmailAddress(params.pendingNewEmail));
  if (!params.signedStatus) return null;
  if (params.signedStatus === "invalid" || params.signedStatus === "unknown") {
    return params.signedStatus;
  }
  if (params.signedStatus === "one") {
    if (!params.sessionReadable) return "one";
    return pending ? "one" : "unknown";
  }
  if (params.signedStatus === "both") {
    return params.sessionReadable && !pending ? "both" : "unknown";
  }
  return "unknown";
}

export function emailChangeResultPath(hasSession: boolean): string {
  return hasSession ? "/account" : "/auth/email-change";
}

export const EMAIL_CHANGE_NOTICE_COOKIE = "brd_email_change";
export const EMAIL_CHANGE_NOTICE_MAX_AGE_SECONDS = 600;

/** Cookie attributes shared by the callback and the one-time clear. */
export function emailChangeNoticeCookieOptions(secure: boolean, maxAge: number) {
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** No secret, no cookie. Never fall back to a public key. */
export function noticeValueForSecret(
  status: EmailChangeNoticeStatus,
  secret: string | null | undefined,
  nowMs: number,
  sign: (body: string) => string,
): string | null {
  if (!secret) return null;
  return sealEmailChangeNotice(status, nowMs, sign);
}

const NOTICE_STATUSES = new Set<EmailChangeNoticeStatus>([
  "one",
  "both",
  "invalid",
  "unknown",
]);

export function sealEmailChangeNotice(
  status: EmailChangeNoticeStatus,
  nowMs: number,
  sign: (body: string) => string,
): string {
  const exp = Math.floor(nowMs / 1000) + 600;
  const body = `${status}.${exp}`;
  return `${body}.${sign(body)}`;
}

export function openEmailChangeNotice(
  token: string,
  nowMs: number,
  sign: (body: string) => string,
): EmailChangeNoticeStatus | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [status, expText, sig] = parts;
  if (!NOTICE_STATUSES.has(status as EmailChangeNoticeStatus)) return null;
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp * 1000 <= nowMs) return null;
  const expected = sign(`${status}.${expText}`);
  if (expected.length !== sig.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (mismatch !== 0) return null;
  return status as EmailChangeNoticeStatus;
}
