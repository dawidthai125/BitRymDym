"use server";

import { requireUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { writePreferences } from "./server";

export type NotificationPrefsState = { error: string | null; success: boolean };

/** Owner saves own toggles (checkbox present = on). */
export async function saveNotificationPreferencesAction(_prev: NotificationPrefsState, form: FormData): Promise<NotificationPrefsState> {
  try {
    const { userId } = await requireUser();
    const ok = await writePreferences(createSupabaseAdminClient(), userId, {
      email_account: form.get("email_account") === "on",
      email_moderation: form.get("email_moderation") === "on",
      email_studio: form.get("email_studio") === "on",
    });
    return ok ? { error: null, success: true } : { error: "zapisBlad", success: false };
  } catch {
    return { error: "zapisBlad", success: false };
  }
}
