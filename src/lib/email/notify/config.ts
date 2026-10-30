/**
 * E-mail notifications (pure config). OFF unless EMAIL_NOTIFICATIONS_ENABLED=true AND Resend
 * (RESEND_API_KEY + RESEND_FROM_EMAIL) AND EMAIL_UNSUBSCRIBE_SECRET are all set.
 * The same flags work on Vercel (welcome, moderation) and on E3 (master / MP4 ready).
 */
export type NotifyCategory = "account" | "moderation" | "studio";
export type NotifyKind = "welcome" | "beat_approved" | "beat_rejected" | "master_ready" | "mp4_ready";

export const KIND_CATEGORY: Record<NotifyKind, NotifyCategory> = {
  welcome: "account",
  beat_approved: "moderation",
  beat_rejected: "moderation",
  master_ready: "studio",
  mp4_ready: "studio",
};

/** Preference columns in public.notification_preferences (all default true). */
export const CATEGORY_COLUMN: Record<NotifyCategory, "email_account" | "email_moderation" | "email_studio"> = {
  account: "email_account",
  moderation: "email_moderation",
  studio: "email_studio",
};

const TRUE = new Set(["true", "1", "yes", "on"]);

export type NotifyEnv = { enabled: true; apiKey: string; from: string; secret: string; replyTo: string | null } | { enabled: false };

export function notifyEnv(env: Record<string, string | undefined>): NotifyEnv {
  const on = TRUE.has((env.EMAIL_NOTIFICATIONS_ENABLED ?? "").trim().toLowerCase());
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM_EMAIL?.trim();
  const secret = env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (!on || !apiKey || !from || !secret || secret.length < 32) return { enabled: false };
  return { enabled: true, apiKey, from, secret, replyTo: env.EMAIL_REPLY_TO?.trim() || null };
}
