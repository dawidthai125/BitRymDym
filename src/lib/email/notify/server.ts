import "server-only";

/**
 * Notification sender. Never throws, never logs addresses. Safe to call from server actions
 * (wrap in `after()`), the auth callback, and the E3 worker.
 * Order: flag/env → recipient + preferences → (dedupe by caller) → Resend with List-Unsubscribe.
 */
import { Resend } from "resend";

import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { CATEGORY_COLUMN, KIND_CATEGORY, notifyEnv, type NotifyCategory, type NotifyKind } from "./config";
import { buildMail, type TemplateData } from "./templates";
import { signUnsubscribeToken } from "./unsubscribe-token";

export type NotifyResult = "sent" | "disabled" | "opted_out" | "no_recipient" | "duplicate" | "failed";

export type NotificationPreferences = { email_account: boolean; email_moderation: boolean; email_studio: boolean };
export const DEFAULT_PREFERENCES: NotificationPreferences = { email_account: true, email_moderation: true, email_studio: true };

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export async function readPreferences(admin: Admin, userId: string): Promise<NotificationPreferences> {
  const { data } = await admin.from("notification_preferences").select("email_account, email_moderation, email_studio").eq("user_id", userId).maybeSingle();
  return { ...DEFAULT_PREFERENCES, ...((data as Partial<NotificationPreferences> | null) ?? {}) };
}

export async function writePreferences(admin: Admin, userId: string, patch: Partial<NotificationPreferences>): Promise<boolean> {
  const { error } = await admin.from("notification_preferences").upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return !error;
}

export function unsubscribeLinks(secret: string, userId: string, category: NotifyCategory) {
  const base = getSiteUrl();
  return {
    unsubscribe: `${base}/api/email/unsubscribe?t=${encodeURIComponent(signUnsubscribeToken(secret, userId, category))}`,
    preferences: `${base}/account#powiadomienia`,
  };
}

export async function sendNotification(p: { userId: string; kind: NotifyKind; data?: Omit<TemplateData, "siteUrl" | "name"> }): Promise<NotifyResult> {
  const env = notifyEnv(process.env);
  if (!env.enabled) return "disabled";
  try {
    const admin = createSupabaseAdminClient();
    const category = KIND_CATEGORY[p.kind];
    const prefs = await readPreferences(admin, p.userId);
    if (!prefs[CATEGORY_COLUMN[category]]) return "opted_out";
    const { data: u } = await admin.auth.admin.getUserById(p.userId);
    const to = u?.user?.email?.trim();
    if (!to || !u.user?.email_confirmed_at) return "no_recipient";
    const { data: prof } = await admin.from("profiles").select("display_name").eq("id", p.userId).maybeSingle();
    const links = unsubscribeLinks(env.secret, p.userId, category);
    const mail = buildMail(p.kind, { ...(p.data ?? {}), siteUrl: getSiteUrl(), name: (prof as { display_name?: string | null } | null)?.display_name ?? null }, links);
    const { error } = await new Resend(env.apiKey).emails.send({
      from: env.from, to, subject: mail.subject, text: mail.text, html: mail.html,
      ...(env.replyTo ? { replyTo: env.replyTo } : {}),
      headers: { "List-Unsubscribe": `<${links.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      tags: [{ name: "kind", value: p.kind }],
    });
    return error ? "failed" : "sent";
  } catch {
    return "failed";
  }
}

/** Welcome once per account: atomic claim of welcome_sent_at, then send. */
export async function sendWelcomeOnce(userId: string): Promise<NotifyResult> {
  if (!notifyEnv(process.env).enabled) return "disabled";
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("notification_preferences").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    const { data } = await admin.from("notification_preferences").update({ welcome_sent_at: new Date().toISOString() })
      .eq("user_id", userId).is("welcome_sent_at", null).select("user_id");
    if (!data?.length) return "duplicate";
    return await sendNotification({ userId, kind: "welcome" });
  } catch {
    return "failed";
  }
}

/** Master / MP4 ready once per job (worker side): atomic claim of studio_master_jobs.notified_at. */
export async function notifyStudioJobReady(job: { id: string; owner_id: string; project_id: string; kind: string }): Promise<NotifyResult> {
  const kind: NotifyKind | null = job.kind === "master" ? "master_ready" : job.kind === "youtube_video" ? "mp4_ready" : null;
  if (!kind) return "disabled";
  if (!notifyEnv(process.env).enabled) return "disabled";
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.from("studio_master_jobs").update({ notified_at: new Date().toISOString() })
      .eq("id", job.id).eq("status", "succeeded").is("notified_at", null).select("id");
    if (!data?.length) return "duplicate";
    const { data: proj } = await admin.from("studio_projects").select("title").eq("id", job.project_id).maybeSingle();
    return await sendNotification({ userId: job.owner_id, kind, data: { projectId: job.project_id, projectTitle: (proj as { title?: string | null } | null)?.title ?? null } });
  } catch {
    return "failed";
  }
}
