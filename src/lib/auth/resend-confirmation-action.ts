"use server";

import { limitResendConfirmation } from "@/lib/auth/attempt-limit";
import type { AuthActionState } from "@/lib/auth/actions";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { getAuthEmailRedirectTo } from "@/lib/site-url";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Same answer for every address: never says whether an account exists or is already active. */
const RESEND_CONFIRMATION_MESSAGE =
  "Jeśli konto z tym adresem czeka na aktywację, wysłaliśmy nowy link. Dojdzie w ciągu kilku minut. Sprawdź też spam i oferty. Działa tylko link z najnowszego maila.";

/** Sends the sign-up confirmation mail once more. */
export async function resendConfirmationAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!getSupabasePublicEnv().isConfigured) {
    return { error: "Logowanie jest chwilowo niedostępne.", success: false };
  }
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Podaj adres e-mail.", success: false };

  const captcha = await verifyTurnstile(formData);
  if (!captcha.ok) return { error: captcha.error, success: false };
  // Fail-closed; counts attempts regardless of whether the account exists.
  const limited = await limitResendConfirmation(email);
  if (!limited.ok) return { error: limited.error, success: false };

  const supabase = await createSupabaseServerClient();
  // The result is not shown (an error would tell an unconfirmed account from a missing one).
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: getAuthEmailRedirectTo(null) },
  });
  if (error) console.warn("[resend-confirmation]", error.code ?? error.status ?? "error");

  return { error: null, success: true, message: RESEND_CONFIRMATION_MESSAGE };
}
