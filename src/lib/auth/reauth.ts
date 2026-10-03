import "server-only";

import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReauthResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

/**
 * Step-up authentication: verify current password for the session user.
 * Identity comes from the existing session — never from client-supplied ids.
 */
export async function reauthenticateWithPassword(
  currentPassword: string,
): Promise<ReauthResult> {
  const password = String(currentPassword ?? "");
  if (!password) {
    return { ok: false, error: "Aktualne hasło jest wymagane." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email) {
    return { ok: false, error: "Wymagane zalogowanie." };
  }

  const email = userData.user.email;
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { ok: false, error: "Nieprawidłowe aktualne hasło." };
  }

  return { ok: true, user: userData.user };
}
