import "server-only";

import { cookies } from "next/headers";

import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_TTL_SECONDS,
  openPasswordRecoveryForSecret,
  passwordRecoveryCookieOptions,
  passwordRecoveryUserMatches,
  sealPasswordRecoveryForSecret,
} from "@/lib/auth/password-recovery-seal";

export { PASSWORD_RECOVERY_COOKIE };
import { getSupabaseServiceRoleKey } from "@/lib/supabase/env";

export function passwordRecoveryCookieValue(
  userId: string,
  nowMs = Date.now(),
): string | null {
  return sealPasswordRecoveryForSecret(userId, getSupabaseServiceRoleKey(), nowMs);
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
  const secret = getSupabaseServiceRoleKey();
  if (!secret) return null;
  const token = (await cookies()).get(PASSWORD_RECOVERY_COOKIE)?.value;
  if (!token) return null;
  return openPasswordRecoveryForSecret(token, secret, nowMs);
}

export async function passwordRecoverySealMatches(userId: string): Promise<boolean> {
  return passwordRecoveryUserMatches(await readPasswordRecoverySeal(), userId);
}

export async function clearPasswordRecoverySeal(): Promise<void> {
  const jar = await cookies();
  jar.set(PASSWORD_RECOVERY_COOKIE, "", passwordRecoveryClearOptions());
}
