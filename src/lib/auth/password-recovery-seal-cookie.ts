import "server-only";

import { cookies } from "next/headers";

import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_TTL_SECONDS,
  openPasswordRecoveryForSecrets,
  passwordRecoveryCookieOptions,
  passwordRecoveryUserMatches,
  sealPasswordRecoveryForSecret,
} from "@/lib/auth/password-recovery-seal";

import { resolveDedicatedSecret } from "@/lib/security/dedicated-secret";

export { PASSWORD_RECOVERY_COOKIE };

/**
 * Seal HMAC key: dedicated PASSWORD_RESET_SEAL_SECRET (security review 2026-11-21).
 * No service-role fallback (dropped 2026-11-22): missing env → no seal, reset fails closed.
 */
function sealSecrets() {
  return resolveDedicatedSecret("PASSWORD_RESET_SEAL_SECRET");
}

export function passwordRecoveryCookieValue(
  userId: string,
  nowMs = Date.now(),
): string | null {
  return sealPasswordRecoveryForSecret(userId, sealSecrets().signing, nowMs);
}

export function passwordRecoverySetOptions() {
  return passwordRecoveryCookieOptions(
    process.env.NODE_ENV === "production",
    PASSWORD_RECOVERY_TTL_SECONDS,
  );
}

export function passwordRecoveryClearOptions() {
  return passwordRecoveryCookieOptions(process.env.NODE_ENV === "production", 0);
}

export async function readPasswordRecoverySeal(
  nowMs = Date.now(),
): Promise<{ userId: string } | null> {
  const { verify } = sealSecrets();
  if (verify.length === 0) return null;
  const token = (await cookies()).get(PASSWORD_RECOVERY_COOKIE)?.value;
  if (!token) return null;
  return openPasswordRecoveryForSecrets(token, verify, nowMs);
}

export async function passwordRecoverySealMatches(userId: string): Promise<boolean> {
  return passwordRecoveryUserMatches(await readPasswordRecoverySeal(), userId);
}

export async function clearPasswordRecoverySeal(): Promise<void> {
  const jar = await cookies();
  jar.set(PASSWORD_RECOVERY_COOKIE, "", passwordRecoveryClearOptions());
}
