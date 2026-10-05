"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deleteOwnAccount } from "@/lib/auth/delete-account";
import { assertDeleteTargetsSessionUser } from "@/lib/auth/delete-account-policy";
import { validateDisplayName } from "@/lib/auth/display-name";
import { validateNewPassword } from "@/lib/auth/password-policy";
import { assertNoPrivilegeEscalationInPayload } from "@/lib/auth/permissions";
import { reauthenticateWithPassword } from "@/lib/auth/reauth";
import { AuthError, getCurrentProfile, requireUser } from "@/lib/auth/session";
import { interpretSignUpResult } from "@/lib/auth/signup-result";
import {
  getAuthEmailRedirectTo,
  getAuthPasswordResetRedirectTo,
} from "@/lib/site-url";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  accountClaimRedirectPath,
  tryClaimAnonTakeAfterAuth,
} from "@/lib/takes/anon-account-claim";
import {
  mapSupabaseAuthError,
  toUserFacingAuthError,
  toUserFacingError,
} from "@/lib/ui/user-errors";

export type AuthActionState = {
  error: string | null;
  success: boolean;
  message?: string | null;
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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthEmailRedirectTo(),
      data: {
        display_name: ksywka.value,
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
    const context = await getCurrentProfile();
    if (context) {
      const claim = await tryClaimAnonTakeAfterAuth(context);
      redirect(accountClaimRedirectPath(claim));
    }
    redirect("/account");
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
    return { error: mapSupabaseAuthError(error.message), success: false };
  }

  revalidatePath("/");
  const context = await getCurrentProfile();
  if (context) {
    const claim = await tryClaimAnonTakeAfterAuth(context);
    redirect(accountClaimRedirectPath(claim));
  }
  redirect("/account");
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

  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return {
      error: "Sesja resetu wygasła. Poproś o nowy link.",
      success: false,
    };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { error: "Nie udało się ustawić nowego hasła.", success: false };
  }

  await supabase.auth.signOut();
  return {
    error: null,
    success: true,
    message: "Hasło zostało ustawione. Możesz się zalogować.",
  };
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
  if (confirmText !== "USUŃ") {
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
