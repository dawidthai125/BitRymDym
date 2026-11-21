import "server-only";

import { notifyEnv } from "@/lib/email/notify/config";
import { sendNotification, type NotifyResult } from "@/lib/email/notify/server";
import {
  formatTakeExpiryWhen,
  planTakeExpiryMails,
  TAKE_EXPIRY_NOTICE_WINDOW_MS,
  type TakeExpiryCandidate,
  type TakeProjectLink,
} from "@/lib/email/notify/take-expiry-plan";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type TakeExpiryNoticeResult = { candidates: number; mails: number; results: Partial<Record<NotifyResult, number>> };

/**
 * Daily cron: mail owners whose recordings (used in a Studio clip) expire within 36 h.
 * Claims takes.expiry_notified_at before sending, so a retry never double-mails.
 * Notifications off → nothing is claimed.
 */
export async function runTakeExpiryNotices(now = Date.now()): Promise<TakeExpiryNoticeResult> {
  const empty: TakeExpiryNoticeResult = { candidates: 0, mails: 0, results: {} };
  if (!notifyEnv(process.env).enabled) return { ...empty, results: { disabled: 1 } };
  const admin = createSupabaseAdminClient();
  const { data: takes, error } = await admin
    .from("takes")
    .select("id, owner_id, expires_at")
    .eq("status", "READY")
    .is("deleted_at", null)
    .is("expiry_notified_at", null)
    .not("owner_id", "is", null)
    .gt("expires_at", new Date(now).toISOString())
    .lte("expires_at", new Date(now + TAKE_EXPIRY_NOTICE_WINDOW_MS).toISOString())
    .limit(500);
  if (error) throw new Error(error.message);
  const candidates: TakeExpiryCandidate[] = (takes ?? []).map((t) => ({ takeId: String(t.id), ownerId: String(t.owner_id), expiresAt: String(t.expires_at) }));
  if (candidates.length === 0) return empty;

  const { data: clips, error: clipErr } = await admin
    .from("studio_clips")
    .select("source_take_id, track_id")
    .eq("source_kind", "TAKE")
    .in("source_take_id", candidates.map((c) => c.takeId));
  if (clipErr) throw new Error(clipErr.message);
  const trackIds = [...new Set((clips ?? []).map((c) => String(c.track_id)))];
  const { data: tracks, error: trackErr } = trackIds.length
    ? await admin.from("studio_tracks").select("id, project_id").in("id", trackIds)
    : { data: [], error: null };
  if (trackErr) throw new Error(trackErr.message);
  const projectIds = [...new Set((tracks ?? []).map((t) => String(t.project_id)))];
  const { data: projects, error: projErr } = projectIds.length
    ? await admin.from("studio_projects").select("id, title, owner_id, status").in("id", projectIds).neq("status", "ARCHIVED")
    : { data: [], error: null };
  if (projErr) throw new Error(projErr.message);

  const trackProject = new Map((tracks ?? []).map((t) => [String(t.id), String(t.project_id)]));
  const projectById = new Map((projects ?? []).map((p) => [String(p.id), p]));
  const links: TakeProjectLink[] = [];
  for (const c of clips ?? []) {
    const pid = trackProject.get(String(c.track_id));
    const p = pid ? projectById.get(pid) : undefined;
    if (!p) continue;
    links.push({ takeId: String(c.source_take_id), projectId: String(p.id), projectTitle: String(p.title ?? ""), projectOwnerId: String(p.owner_id) });
  }

  const plan = planTakeExpiryMails(candidates, links);
  const results: Partial<Record<NotifyResult, number>> = {};
  for (const mail of plan) {
    const { data: claimed } = await admin
      .from("takes")
      .update({ expiry_notified_at: new Date(now).toISOString() })
      .in("id", mail.takeIds)
      .eq("owner_id", mail.ownerId)
      .is("expiry_notified_at", null)
      .select("id");
    if (!claimed?.length) {
      results.duplicate = (results.duplicate ?? 0) + 1;
      continue;
    }
    const when = formatTakeExpiryWhen(mail.expiresAt, now);
    const r = await sendNotification({
      userId: mail.ownerId,
      kind: "take_expiring",
      data: {
        projectId: mail.projectId,
        projectTitle: mail.projectTitle,
        detail: mail.otherProjects > 0 ? `${when} (nagrania w ${mail.otherProjects + 1} projektach)` : when,
      },
    });
    results[r] = (results[r] ?? 0) + 1;
  }
  return { candidates: candidates.length, mails: plan.length, results };
}
