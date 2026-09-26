"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertNoPrivilegeEscalationInPayload } from "@/lib/auth/permissions";
import { AuthError, requireUser } from "@/lib/auth/session";
import { interpretSignUpResult } from "@/lib/auth/signup-result";
import { getAuthEmailRedirectTo } from "@/lib/site-url";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    requireConfiguredSupabase();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Supabase not configured.",
      success: false,
      message: null,
    };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password) {
    return {
      error: "Email i hasło są wymagane.",
      success: false,
      message: null,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthEmailRedirectTo(),
      data: {
        display_name: displayName || undefined,
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

  if (outcome.kind === "session") {
    revalidatePath("/");
    redirect("/account");
  }

  // pending_confirmation — no account redirect (anti-enumeration + confirm email UX)
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
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Supabase not configured.",
      success: false,
    };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email i hasło są wymagane.", success: false };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message, success: false };
  }

  revalidatePath("/");
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
    const displayName = String(formData.get("displayName") ?? "").trim();

    const payload = { display_name: displayName || null };
    assertNoPrivilegeEscalationInPayload(payload);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", context.userId);

    if (error) {
      return { error: error.message, success: false };
    }

    revalidatePath("/account");
    return { error: null, success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: error.message, success: false };
    }
    const message =
      error instanceof Error ? error.message : "Aktualizacja nie powiodła się.";
    return { error: message, success: false };
  }
}
