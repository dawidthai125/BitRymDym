import "server-only";

// Turnstile is active in production (keys set on Vercel). The check runs on our server; do NOT also
// enable CAPTCHA in Supabase Auth, because Supabase would then demand its own token on every sign-in.

import { clientIpFromHeaders } from "@/lib/auth/attempt-limit";
import { headers } from "next/headers";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;

export const TURNSTILE_FIELD = "cf-turnstile-response";
export const TURNSTILE_FAILED_MESSAGE =
  "Nie udało się zweryfikować, że jesteś człowiekiem. Odśwież stronę i spróbuj ponownie.";

/** CAPTCHA is active only when BOTH the public site key and the secret are set. */
export function isTurnstileEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() &&
      process.env.TURNSTILE_SECRET_KEY?.trim(),
  );
}

export type TurnstileResult = { ok: true } | { ok: false; error: string };

/** Fail-closed when enabled: missing token, network error, timeout or non-success all reject. */
export async function verifyTurnstile(formData: FormData): Promise<TurnstileResult> {
  if (!isTurnstileEnabled()) return { ok: true };
  const fail: TurnstileResult = { ok: false, error: TURNSTILE_FAILED_MESSAGE };

  const token = String(formData.get(TURNSTILE_FIELD) ?? "");
  if (!token || token.length > 4096) return fail;

  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!.trim(),
    response: token,
  });
  try {
    const ip = clientIpFromHeaders(await headers());
    if (ip !== "unknown") body.set("remoteip", ip);
  } catch {
    // no request scope; verify without remoteip
  }

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return fail;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true ? { ok: true } : fail;
  } catch (error) {
    console.error(
      "[turnstile] siteverify failed (fail-closed)",
      error instanceof Error ? error.name : "unknown",
    );
    return fail;
  }
}
