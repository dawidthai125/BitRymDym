import { createHmac, timingSafeEqual } from "node:crypto";

/** Separate from the email-change notice. Not a session id and not a bearer token. */
export const PASSWORD_RECOVERY_COOKIE = "brd_password_recovery";
export const PASSWORD_RECOVERY_TTL_SECONDS = 600;
export const PASSWORD_RECOVERY_PURPOSE = "recovery";

export type PasswordRecoverySeal = {
  userId: string;
};

export function passwordRecoveryCookieOptions(secure: boolean, maxAge: number) {
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function isSealUserId(userId: string): boolean {
  return userId.length > 0 && userId.length <= 128 && !/[\s;,]/.test(userId);
}

/**
 * Body is `recovery.<user id>.<exp>`. The signature is the final segment.
 * User ids may contain dots; the signature is base64url and may not.
 */
function splitSeal(token: string): { body: string; signature: string } | null {
  const sigAt = token.lastIndexOf(".");
  if (sigAt <= 0 || sigAt === token.length - 1) return null;
  return { body: token.slice(0, sigAt), signature: token.slice(sigAt + 1) };
}

function splitBody(body: string): { purpose: string; userId: string; expText: string } | null {
  const purposeAt = body.indexOf(".");
  const expAt = body.lastIndexOf(".");
  if (purposeAt <= 0 || expAt <= purposeAt) return null;
  return {
    purpose: body.slice(0, purposeAt),
    userId: body.slice(purposeAt + 1, expAt),
    expText: body.slice(expAt + 1),
  };
}

function signaturesMatch(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  if (expectedBytes.length === 0 || expectedBytes.length !== actualBytes.length) {
    return false;
  }
  return timingSafeEqual(expectedBytes, actualBytes);
}

export function sealPasswordRecovery(
  userId: string,
  nowMs: number,
  sign: (body: string) => string,
): string | null {
  if (!isSealUserId(userId)) return null;
  const exp = Math.floor(nowMs / 1000) + PASSWORD_RECOVERY_TTL_SECONDS;
  const body = `${PASSWORD_RECOVERY_PURPOSE}.${userId}.${exp}`;
  const signature = sign(body);
  if (!signature || signature.includes(".")) return null;
  return `${body}.${signature}`;
}

export function openPasswordRecovery(
  token: string,
  nowMs: number,
  sign: (body: string) => string,
): PasswordRecoverySeal | null {
  const parts = splitSeal(token);
  if (!parts) return null;
  const fields = splitBody(parts.body);
  if (!fields) return null;
  if (fields.purpose !== PASSWORD_RECOVERY_PURPOSE) return null;
  if (!isSealUserId(fields.userId)) return null;
  if (!/^[0-9]+$/.test(fields.expText)) return null;
  const exp = Number(fields.expText);
  if (!Number.isFinite(exp) || exp * 1000 <= nowMs) return null;
  const expected = sign(parts.body);
  if (!signaturesMatch(expected, parts.signature)) return null;
  return { userId: fields.userId };
}

export function passwordRecoveryUserMatches(
  opened: PasswordRecoverySeal | null,
  userId: string,
): boolean {
  return opened !== null && isSealUserId(userId) && opened.userId === userId;
}

export function signPasswordRecoveryBody(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** No secret, no seal. Never fall back to a public key. */
export function sealPasswordRecoveryForSecret(
  userId: string,
  secret: string | null | undefined,
  nowMs: number,
): string | null {
  if (!secret) return null;
  return sealPasswordRecovery(userId, nowMs, (body) =>
    signPasswordRecoveryBody(secret, body),
  );
}

export function openPasswordRecoveryForSecret(
  token: string,
  secret: string | null | undefined,
  nowMs: number,
): PasswordRecoverySeal | null {
  if (!secret) return null;
  return openPasswordRecovery(token, nowMs, (body) =>
    signPasswordRecoveryBody(secret, body),
  );
}
