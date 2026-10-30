"use server";

import { signupConsent } from "@/lib/legal/legal-config";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isDeleteConfirmWord } from "@/i18n/config";
import { deleteOwnAccount } from "@/lib/auth/delete-account";
import { assertDeleteTargetsSessionUser } from "@/lib/auth/delete-account-policy";
import { validateDisplayName } from "@/lib/auth/display-name";
import {
  EMAIL_CHANGE_AWAITING_MESSAGE,
  requestEmailChange,
} from "@/lib/auth/email-change";
import { validateNewPassword } from "@/lib/auth/password-policy";
import {
  clearPasswordRecoverySeal,
  passwordRecoverySealMatches,
} from "@/lib/auth/password-recovery-seal-cookie";
import { assertNoPrivilegeEscalationInPayload } from "@/lib/auth/permissions";
import { safeNextPath } from "@/lib/auth/next-path";
import { reauthenticateWithPassword } from "@/lib/auth/reauth";
import { AuthError, getCurrentProfile, requireUser } from "@/lib/auth/session";
import { interpretSignUpResult } from "@/lib/auth/signup-result";
import {
  getAuthEmailChangeRedirectTo,
  getAuthEmailRedirectTo,
  getAuthPasswordResetRedirectTo,
} from "@/lib/site-url";
import {
  MAINTENANCE_SIGN_IN_ERROR,
  MAINTENANCE_SIGN_UP_ERROR,
} from "@/lib/site/maintenance-gate";
import { readSiteMaintenanceForViewer } from "@/lib/site/maintenance-settings";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  accountClaimRedirectPath,
  tryClaimAnonTakeAfterAuth,
} from "@/lib/takes/anon-account-claim";
import {
  mapSignInAuthError,
  toUserFacingAuthError,
  toUserFacingError,
} from "@/lib/ui/user-errors";

export type AuthActionState = {
  error: string | null;
  success: boolean;
  message?: string | null;
  /** Email change started; not a completed address swap. */
  pendingConfirmation?: boolean;
};

function requireConfiguredSupabase() {
  const env = getSupabasePublicEnv();
  if (!env.isConfigured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
}

function authConfigUnavailableError(): AuthActionState {
  return {
    error: "Logowanie jest chwilowo niedostępne.",
    success: false,
    message: null,
  };
}

const SIGN_UP_TERMS_REQUIRED_ERROR = "Zaakceptuj Regulamin i Politykę prywatności, aby założyć konto.";

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    requireConfiguredSupabase();
  } catch {
    return authConfigUnavailableError();
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const displayNameRaw = String(formData.get("displayName") ?? "");

  if (!email) {
    return {
      error: "E-mail i hasło są wymagane.",
      success: false,
      message: null,
    };
  }

  const passwordCheck = validateNewPassword(password, confirmPassword);
  if (!passwordCheck.ok) {
    return { error: passwordCheck.error, success: false, message: null };
  }

  const ksywka = validateDisplayName(displayNameRaw);
  if (!ksywka.ok) {
    return { error: ksywka.error, success: false, message: null };
  }

  if (formData.get("acceptTerms") !== "on") {
    return { error: SIGN_UP_TERMS_REQUIRED_ERROR, success: false, message: null };
  }

  // Maintenance mode: no new accounts (page is gated too; this is the server check).
  const supabase = await createSupabaseServerClient();
  if ((await readSiteMaintenanceForViewer(supabase)).enabled) {
    return { error: MAINTENANCE_SIGN_UP_ERROR, success: false, message: null };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthEmailRedirectTo(),
      data: {
        display_name: ksywka.value,
        // Regulamin + Polityka prywatności accepted at sign-up (version + time).
        ...signupConsent(),
      },
    },
  });

  const outcome = interpretSignUpResult({
    error,
    session: data.session,
    identities: data.user?.identities ?? null,
  });

  if (outcome.kind === "error") {
    return { error: outcome.error, success: false, message: null };
  }

  if (data.user?.id) {
    const { hookProfileCompleted } = await import(
      "@/lib/creator-progress/award-hooks"
    );
    await hookProfileCompleted(data.user.id);
  }

  if (outcome.kind === "session") {
    revalidatePath("/");
    const next = safeNextPath(formData.get("next"));
    const context = await getCurrentProfile();
    if (context) {
      const claim = await tryClaimAnonTakeAfterAuth(context);
      // Same rule as sign-in: a claimed guest take wins, else go back.
      redirect(claim.ux === "none" && next ? next : accountClaimRedirectPath(claim));
    }
    redirect(next ?? "/account");
  }

  return {
    error: null,
    success: true,
    message: outcome.message,
  };
}

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    requireConfiguredSupabase();
  } catch {
    return {
      error: "Logowanie jest chwilowo niedostępne.",
      success: false,
    };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "E-mail i hasło są wymagane.", success: false };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: mapSignInAuthError(error.message), success: false };
  }

  // Maintenance mode: only ADMIN accounts may sign in; drop any other session.
  const maintenance = await readSiteMaintenanceForViewer(supabase);
  if (maintenance.enabled && !maintenance.viewerIsAdmin) {
    await supabase.auth.signOut();
    return { error: MAINTENANCE_SIGN_IN_ERROR, success: false };
  }

  revalidatePath("/");
  const next = safeNextPath(formData.get("next"));
  const context = await getCurrentProfile();
  if (context) {
    const claim = await tryClaimAnonTakeAfterAuth(context);
    // A claimed guest take wins (its banner lives on /account); otherwise
    // go back where the guest came from (e.g. /studio).
    redirect(claim.ux === "none" && next ? next : accountClaimRedirectPath(claim));
  }
  redirect(next ?? "/account");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/");
  redirect("/");
}

export async function updateDisplayNameAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    const context = await requireUser();
    const ksywka = validateDisplayName(String(formData.get("displayName") ?? ""));
    if (!ksywka.ok) {
      return { error: ksywka.error, success: false };
    }

    const payload = { display_name: ksywka.value };
    assertNoPrivilegeEscalationInPayload(payload);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", context.userId);

    if (error) {
      return { error: toUserFacingError(error.message, "generic"), success: false };
    }

    const { hookProfileCompleted } = await import(
      "@/lib/creator-progress/award-hooks"
    );
    await hookProfileCompleted(context.userId);

    revalidatePath("/account");
    return { error: null, success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: toUserFacingAuthError(error), success: false };
    }
    return {
      error: toUserFacingUnknownSafe(error),
      success: false,
    };
  }
}

function toUserFacingUnknownSafe(error: unknown): string {
  if (error instanceof Error) {
    return toUserFacingError(error.message, "generic");
  }
  return "Aktualizacja nie powiodła się.";
}

export async function changePasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    requireConfiguredSupabase();
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: toUserFacingAuthError(error), success: false };
    }
    return {
      error: "Logowanie jest chwilowo niedostępne.",
      success: false,
    };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const passwordCheck = validateNewPassword(newPassword, confirmPassword);
  if (!passwordCheck.ok) {
    return { error: passwordCheck.error, success: false };
  }

  const reauth = await reauthenticateWithPassword(currentPassword);
  if (!reauth.ok) {
    return { error: reauth.error, success: false };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { error: "Nie udało się zmienić hasła.", success: false };
  }

  return {
    error: null,
    success: true,
    message: "Hasło zostało zmienione.",
  };
}

/**
 * Forgot-password request — anti-enumeration: always success-shaped message.
 */
export async function requestPasswordResetAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    requireConfiguredSupabase();
  } catch {
    return {
      error: "Reset hasła jest chwilowo niedostępny.",
      success: false,
    };
  }

  const email = String(formData.get("email") ?? "").trim();
  const genericMessage =
    "Jeśli konto z tym adresem istnieje, wysłaliśmy link do resetu hasła.";

  if (!email) {
    return { error: "Podaj adres e-mail.", success: false };
  }

  const supabase = await createSupabaseServerClient();
  // Do not branch UX on whether the email exists.
  // redirectTo carries flow=recovery so PKCE ?code= keeps session → reset-password.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAuthPasswordResetRedirectTo(),
  });

  return {
    error: null,
    success: true,
    message: genericMessage,
  };
}

export async function updatePasswordAfterResetAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    requireConfiguredSupabase();
  } catch {
    return {
      error: "Reset hasła jest chwilowo niedostępny.",
      success: false,
    };
  }

  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const passwordCheck = validateNewPassword(newPassword, confirmPassword);
  if (!passwordCheck.ok) {
    return { error: passwordCheck.error, success: false };
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return {
      error: "Reset hasła jest chwilowo niedostępny.",
      success: false,
    };
  }

  let userId: string;
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user?.id) {
      return {
        error: "Sesja resetu wygasła. Poproś o nowy link.",
        success: false,
      };
    }
    userId = userData.user.id;
  } catch {
    return {
      error: "Sesja resetu wygasła. Poproś o nowy link.",
      success: false,
    };
  }

  let sealMatches = false;
  try {
    sealMatches = await passwordRecoverySealMatches(userId);
  } catch {
    return {
      error: "Reset hasła jest chwilowo niedostępny.",
      success: false,
    };
  }
  if (!sealMatches) {
    return {
      error: "Sesja resetu wygasła. Poproś o nowy link.",
      success: false,
    };
  }

  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { error: "Nie udało się ustawić nowego hasła.", success: false };
    }
  } catch {
    return { error: "Nie udało się ustawić nowego hasła.", success: false };
  }

  let cleared = false;
  try {
    await clearPasswordRecoverySeal();
    cleared = true;
  } catch {
    cleared = false;
  }

  try {
    await supabase.auth.signOut();
  } catch {
    if (!cleared) {
      return {
        error: "Nie udało się dokończyć ustawiania hasła. Poproś o nowy link.",
        success: false,
      };
    }
    return {
      error: null,
      success: true,
      message: "Hasło zostało ustawione. Możesz się zalogować.",
    };
  }

  if (!cleared) {
    return {
      error: "Nie udało się dokończyć ustawiania hasła. Poproś o nowy link.",
      success: false,
    };
  }

  return {
    error: null,
    success: true,
    message: "Hasło zostało ustawione. Możesz się zalogować.",
  };
}

export async function requestEmailChangeAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  let sessionUserId: string | null = null;
  let sessionEmail: string | null = null;
  try {
    requireConfiguredSupabase();
    const context = await requireUser();
    sessionUserId = context.userId;
    sessionEmail = context.email;
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: toUserFacingAuthError(error), success: false };
    }
    return {
      error: "Zmiana adresu e-mail jest chwilowo niedostępna.",
      success: false,
    };
  }

  try {
    const result = await requestEmailChange({
      sessionUserId,
      sessionEmail,
      newEmail: String(formData.get("newEmail") ?? ""),
      confirmEmail: String(formData.get("confirmEmail") ?? ""),
      currentPassword: String(formData.get("currentPassword") ?? ""),
      claimedUserId: String(formData.get("userId") ?? "") || null,
      claimedUserNumber: String(formData.get("userNumber") ?? "") || null,
      reauthenticate: async (password) => {
        const reauth = await reauthenticateWithPassword(password);
        if (!reauth.ok) return { ok: false, error: reauth.error };
        return { ok: true };
      },
      startAuthEmailChange: async (email) => {
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.auth.updateUser(
          { email },
          { emailRedirectTo: getAuthEmailChangeRedirectTo() },
        );
        return { errorMessage: error?.message ?? null };
      },
    });

    if (!result.ok) {
      return { error: result.error, success: false, pendingConfirmation: false };
    }

    revalidatePath("/account");
    return {
      error: null,
      success: false,
      pendingConfirmation: true,
      message: result.message || EMAIL_CHANGE_AWAITING_MESSAGE,
    };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: toUserFacingAuthError(error), success: false };
    }
    return {
      error: "Nie udało się rozpocząć zmiany adresu. Sprawdź dane i spróbuj ponownie.",
      success: false,
      pendingConfirmation: false,
    };
  }
}

export async function deleteAccountAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    requireConfiguredSupabase();
    const context = await requireUser();

    // Ignore/deny foreign identity claims from the form (IDOR).
    assertDeleteTargetsSessionUser({
      sessionUserId: context.userId,
      claimedUserId: String(formData.get("userId") ?? "") || null,
      claimedUserNumber: String(formData.get("userNumber") ?? "") || null,
      claimedEmail: String(formData.get("email") ?? "") || null,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: toUserFacingAuthError(error), success: false };
    }
    return {
      error: toUserFacingError(
        error instanceof Error ? error.message : null,
        "generic",
      ),
      success: false,
    };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const confirmText = String(formData.get("confirmText") ?? "").trim();
  if (!isDeleteConfirmWord(confirmText)) {
    return {
      error: "Aby potwierdzić, wpisz USUŃ.",
      success: false,
    };
  }

  const result = await deleteOwnAccount({ currentPassword });
  if (!result.ok) {
    return {
      error: toUserFacingError(result.error, "auth"),
      success: false,
    };
  }

  revalidatePath("/");
  redirect("/");
}
