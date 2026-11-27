import "server-only";

import { createPrivateKey, sign } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * App Store 5.1.1(v): deleting an account must revoke its Sign in with Apple tokens.
 * Supabase returns the Apple refresh token only at sign-in, so it is kept here (service role only).
 * Never log tokens or the key.
 */
const TABLE = "apple_sign_in_tokens";
const REVOKE_URL = "https://appleid.apple.com/auth/revoke";

type AppleEnv = { keyId: string; teamId: string; clientId: string; privateKey: string };

function appleEnv(env: Record<string, string | undefined> = process.env): AppleEnv | null {
  const keyId = env.APPLE_SIGNIN_KEY_ID?.trim();
  const teamId = env.APPLE_TEAM_ID?.trim();
  const clientId = env.APPLE_SERVICES_ID?.trim();
  const privateKey = env.APPLE_SIGNIN_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return keyId && teamId && clientId && privateKey ? { keyId, teamId, clientId, privateKey } : null;
}

export function appleClientSecret(cfg: AppleEnv, now = Date.now()): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const iat = Math.floor(now / 1000);
  const head = `${part({ alg: "ES256", kid: cfg.keyId })}.${part({
    iss: cfg.teamId,
    iat,
    exp: iat + 300,
    aud: "https://appleid.apple.com",
    sub: cfg.clientId,
  })}`;
  const signature = sign("sha256", Buffer.from(head), {
    key: createPrivateKey(cfg.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${head}.${signature.toString("base64url")}`;
}

/** Best-effort: a failure here must never break the sign-in. */
export async function saveAppleRefreshToken(userId: string, refreshToken: string): Promise<void> {
  try {
    const { error } = await createSupabaseAdminClient()
      .from(TABLE)
      .upsert({ user_id: userId, refresh_token: refreshToken, updated_at: new Date().toISOString() });
    if (error) console.error("[apple] token not saved");
  } catch {
    console.error("[apple] token not saved");
  }
}

/** Best-effort before the auth user is deleted (the row goes with it). */
export async function revokeAppleSignIn(userId: string, fetcher: typeof fetch = fetch): Promise<void> {
  try {
    const { data } = await createSupabaseAdminClient()
      .from(TABLE)
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    const token = (data as { refresh_token?: string } | null)?.refresh_token;
    if (!token) return;
    const cfg = appleEnv();
    if (!cfg) {
      console.error("[apple] revoke skipped: Sign in with Apple key is not configured");
      return;
    }
    const response = await fetcher(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: appleClientSecret(cfg),
        token,
        token_type_hint: "refresh_token",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) console.error(`[apple] revoke failed: HTTP ${response.status}`);
  } catch {
    console.error("[apple] revoke failed");
  }
}
