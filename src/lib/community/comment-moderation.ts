/**
 * Comment moderation: author delete, owner/staff hide, member reports (DSA art. 16)
 * and the staff report queue in /admin/moderation.
 * All reads and writes go through the service-role client after a server-side check;
 * community_comments and community_comment_reports grant nothing to anon/authenticated.
 */

import "server-only";

import { isUuid } from "@/lib/beats/audio-validation";
import { AuthError, requireRole } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  cleanReportDetails,
  hideRole,
  isStaffRole,
  parseReportReason,
  REPORTS_PER_HOUR,
  shouldAutoHide,
  threadHref,
  type HiddenReason,
  type ReportReason,
} from "@/lib/community/comment-moderation-policy";
import { findWork } from "@/lib/community/community-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SystemRole } from "@/types/domain";

const COMMENTS = "community_comments";
const REPORTS = "community_comment_reports";
const COMMENT_SELECT = "id, user_id, target_kind, target_id, body, created_at, deleted_at, hidden_at, hidden_reason";
const QUEUE_LIMIT = 300;

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type DbError = { message?: string; code?: string } | null;

type CommentRow = {
  id: string;
  user_id: string;
  target_kind: string;
  target_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
  hidden_at: string | null;
  hidden_reason: HiddenReason | null;
};

export type DeleteCommentResult = "ok" | "forbidden" | "missing" | "invalid" | "off";
export type HideCommentResult = "ok" | "forbidden" | "missing" | "invalid" | "off";
export type ReportCommentResult = "ok" | "already" | "own" | "missing" | "invalid" | "limit" | "off";

export type Actor = { userId: string; role: SystemRole; userNumber?: number | null };

/** Table or moderation column absent (migration 20261122130000 not applied yet). */
function moderationMissing(error: DbError): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes(REPORTS) ||
    message.includes("could not find") ||
    message.includes("schema cache") ||
    message.includes("does not exist")
  );
}

function adminOrNull(): Admin | null {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

async function loadComment(admin: Admin, commentId: string): Promise<{ state: "off" | "missing" } | { state: "ok"; row: CommentRow }> {
  const { data, error } = await admin.from(COMMENTS).select(COMMENT_SELECT).eq("id", commentId).maybeSingle();
  if (moderationMissing(error)) return { state: "off" };
  if (error) return { state: "off" };
  if (!data) return { state: "missing" };
  return { state: "ok", row: data as CommentRow };
}

async function writeAudit(
  admin: Admin,
  input: {
    actor: Actor;
    action: "COMMUNITY_COMMENT_HIDE" | "COMMUNITY_REPORT_DISMISS";
    comment: CommentRow;
    openReports: number;
    panel: "admin_moderation" | "thread";
    newValue: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.from("admin_audit_events").insert({
    actor_user_id: input.actor.userId,
    target_user_id: input.comment.user_id,
    actor_user_number: input.actor.userNumber ?? null,
    target_user_number: null,
    action: input.action,
    old_value: { hiddenAt: input.comment.hidden_at, hiddenReason: input.comment.hidden_reason, openReports: input.openReports },
    new_value: input.newValue,
    metadata: {
      panel: input.panel,
      commentId: input.comment.id,
      targetKind: input.comment.target_kind,
      targetId: input.comment.target_id,
    },
  });
  if (error) console.error("[community-moderation] audit insert failed:", error.message);
}

async function closeOpenReports(admin: Admin, commentId: string, actorId: string, status: "actioned" | "dismissed"): Promise<number | null> {
  const { data, error } = await admin
    .from(REPORTS)
    .update({ status, resolved_at: new Date().toISOString(), resolved_by: actorId })
    .eq("comment_id", commentId)
    .eq("status", "open")
    .select("id");
  if (error) return null;
  return (data ?? []).length;
}

/** Soft delete by the author only. Repeating it is a no-op. */
export async function deleteOwnComment(userId: string, commentId: unknown): Promise<DeleteCommentResult> {
  if (typeof commentId !== "string" || !isUuid(commentId)) return "invalid";
  const admin = adminOrNull();
  if (!admin) return "off";
  const loaded = await loadComment(admin, commentId);
  if (loaded.state !== "ok") return loaded.state;
  if (loaded.row.user_id !== userId) return "forbidden";
  if (loaded.row.deleted_at) return "ok";
  const { error } = await admin
    .from(COMMENTS)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId)
    .eq("user_id", userId);
  if (moderationMissing(error) || error) return "off";
  return "ok";
}

/** Hide by the work's owner or by staff. Staff hiding also closes open reports and is audited. */
export async function hideComment(actor: Actor, commentId: unknown): Promise<HideCommentResult> {
  if (typeof commentId !== "string" || !isUuid(commentId)) return "invalid";
  const admin = adminOrNull();
  if (!admin) return "off";
  const loaded = await loadComment(admin, commentId);
  if (loaded.state !== "ok") return loaded.state;
  const comment = loaded.row;
  if (comment.deleted_at) return "missing";
  const staff = isStaffRole(actor.role);
  const work = staff
    ? null
    : await findWork(comment.target_kind as "beat" | "sample" | "work", comment.target_id).catch(() => null);
  const role = hideRole({ viewerId: actor.userId, workOwnerId: work?.ownerId ?? null, role: actor.role });
  if (!role) return "forbidden";
  if (comment.hidden_at && (role === "owner" || comment.hidden_reason === "staff")) return "ok";
  const { error } = await admin
    .from(COMMENTS)
    .update({ hidden_at: new Date().toISOString(), hidden_by: actor.userId, hidden_reason: role })
    .eq("id", commentId);
  if (moderationMissing(error) || error) return "off";
  if (role === "staff") {
    const closed = await closeOpenReports(admin, commentId, actor.userId, "actioned");
    await writeAudit(admin, {
      actor,
      action: "COMMUNITY_COMMENT_HIDE",
      comment,
      openReports: closed ?? 0,
      panel: "thread",
      newValue: { hiddenReason: "staff" },
    });
  }
  return "ok";
}

/** One report per member per comment; REPORTS_PER_HOUR per member. */
export async function reportComment(
  userId: string,
  commentId: unknown,
  reasonInput: unknown,
  detailsInput: unknown,
): Promise<ReportCommentResult> {
  if (typeof commentId !== "string" || !isUuid(commentId)) return "invalid";
  const reason = parseReportReason(reasonInput);
  const details = cleanReportDetails(detailsInput);
  if (!reason || details === undefined) return "invalid";
  const admin = adminOrNull();
  if (!admin) return "off";
  const loaded = await loadComment(admin, commentId);
  if (loaded.state !== "ok") return loaded.state;
  const comment = loaded.row;
  if (comment.deleted_at || comment.hidden_at) return "missing";
  if (comment.user_id === userId) return "own";

  const existing = await admin
    .from(REPORTS)
    .select("id")
    .eq("comment_id", commentId)
    .eq("reporter_id", userId)
    .maybeSingle();
  if (moderationMissing(existing.error)) return "off";
  if (existing.data) return "already";

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await admin
    .from(REPORTS)
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", userId)
    .gte("created_at", since);
  if (recent.error) return "off";
  if ((recent.count ?? 0) >= REPORTS_PER_HOUR) return "limit";

  const saved = await admin.from(REPORTS).insert({ comment_id: commentId, reporter_id: userId, reason, details });
  if (saved.error?.code === "23505") return "already";
  if (saved.error) return moderationMissing(saved.error) ? "off" : "invalid";

  const open = await admin
    .from(REPORTS)
    .select("id", { count: "exact", head: true })
    .eq("comment_id", commentId)
    .eq("status", "open");
  if (!open.error && shouldAutoHide(open.count ?? 0)) {
    await admin
      .from(COMMENTS)
      .update({ hidden_at: new Date().toISOString(), hidden_by: null, hidden_reason: "reports" })
      .eq("id", commentId)
      .is("hidden_at", null);
  }
  return "ok";
}

// ---------------------------------------------------------------- staff queue

export type CommentReportQueueItem = {
  commentId: string;
  body: string;
  authorId: string;
  commentCreatedAt: string;
  targetKind: string;
  targetId: string;
  threadHref: string;
  state: "visible" | "deleted" | HiddenReason;
  reporters: number;
  reasons: Partial<Record<ReportReason, number>>;
  details: string[];
  firstReportedAt: string;
  lastReportedAt: string;
};

export type CommentReportQueue = { enabled: boolean; items: CommentReportQueueItem[] };

function commentState(row: CommentRow): CommentReportQueueItem["state"] {
  if (row.deleted_at) return "deleted";
  if (row.hidden_at) return row.hidden_reason ?? "staff";
  return "visible";
}

/** Open reports grouped per comment, most reported first. ADMIN + MODERATOR. */
export async function listOpenCommentReports(): Promise<CommentReportQueue> {
  await requireRole(["ADMIN", "MODERATOR"]);
  const admin = adminOrNull();
  if (!admin) return { enabled: false, items: [] };
  const reports = await admin
    .from(REPORTS)
    .select("comment_id, reason, details, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(QUEUE_LIMIT);
  if (moderationMissing(reports.error)) return { enabled: false, items: [] };
  if (reports.error) throw new Error("community_reports_load_failed");
  const rows = (reports.data ?? []) as Array<{ comment_id: string; reason: ReportReason; details: string | null; created_at: string }>;
  const ids = [...new Set(rows.map((row) => row.comment_id))];
  if (ids.length === 0) return { enabled: true, items: [] };
  const comments = await admin.from(COMMENTS).select(COMMENT_SELECT).in("id", ids);
  if (comments.error) throw new Error("community_reports_load_failed");
  const byId = new Map(((comments.data ?? []) as CommentRow[]).map((row) => [row.id, row]));
  const items = new Map<string, CommentReportQueueItem>();
  for (const report of rows) {
    const comment = byId.get(report.comment_id);
    if (!comment) continue;
    const item = items.get(comment.id) ?? {
      commentId: comment.id,
      body: comment.body,
      authorId: comment.user_id,
      commentCreatedAt: comment.created_at,
      targetKind: comment.target_kind,
      targetId: comment.target_id,
      threadHref: threadHref(comment.target_kind, comment.target_id),
      state: commentState(comment),
      reporters: 0,
      reasons: {},
      details: [],
      firstReportedAt: report.created_at,
      lastReportedAt: report.created_at,
    };
    item.reporters += 1;
    item.reasons[report.reason] = (item.reasons[report.reason] ?? 0) + 1;
    if (report.details) item.details.push(report.details);
    item.lastReportedAt = report.created_at;
    items.set(comment.id, item);
  }
  return {
    enabled: true,
    items: [...items.values()].sort((a, b) => b.reporters - a.reporters || a.firstReportedAt.localeCompare(b.firstReportedAt)),
  };
}

export type ResolveCommentReportsOutcome =
  | { ok: true }
  | { ok: false; code: "FORBIDDEN" | "UNAUTHENTICATED" | "INVALID_INPUT" | "NOT_FOUND" | "ALREADY_CLOSED" | "RESOLVE_FAILED" };

/**
 * Staff decision on a reported comment. "hide" hides it for good; "dismiss" closes the reports
 * and restores a comment that only the report threshold had hidden.
 */
export async function resolveCommentReports(commentId: unknown, decision: unknown): Promise<ResolveCommentReportsOutcome> {
  let context: AuthContext;
  try {
    context = await requireRole(["ADMIN", "MODERATOR"]);
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, code: error.code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN" };
    }
    throw error;
  }
  if (typeof commentId !== "string" || !isUuid(commentId) || (decision !== "hide" && decision !== "dismiss")) {
    return { ok: false, code: "INVALID_INPUT" };
  }
  const admin = adminOrNull();
  if (!admin) return { ok: false, code: "RESOLVE_FAILED" };
  const loaded = await loadComment(admin, commentId);
  if (loaded.state === "missing") return { ok: false, code: "NOT_FOUND" };
  if (loaded.state !== "ok") return { ok: false, code: "RESOLVE_FAILED" };
  const comment = loaded.row;
  const actor: Actor = { userId: context.userId, role: context.profile.role, userNumber: context.profile.userNumber };

  if (decision === "hide") {
    const hidden = await admin
      .from(COMMENTS)
      .update({ hidden_at: comment.hidden_at ?? new Date().toISOString(), hidden_by: actor.userId, hidden_reason: "staff" })
      .eq("id", commentId);
    if (hidden.error) return { ok: false, code: "RESOLVE_FAILED" };
  }
  const closed = await closeOpenReports(admin, commentId, actor.userId, decision === "hide" ? "actioned" : "dismissed");
  if (closed === null) return { ok: false, code: "RESOLVE_FAILED" };
  if (closed === 0 && decision === "dismiss") return { ok: false, code: "ALREADY_CLOSED" };
  let restored = false;
  if (decision === "dismiss" && comment.hidden_reason === "reports") {
    const unhidden = await admin
      .from(COMMENTS)
      .update({ hidden_at: null, hidden_by: null, hidden_reason: null })
      .eq("id", commentId)
      .eq("hidden_reason", "reports");
    restored = !unhidden.error;
  }
  await writeAudit(admin, {
    actor,
    action: decision === "hide" ? "COMMUNITY_COMMENT_HIDE" : "COMMUNITY_REPORT_DISMISS",
    comment,
    openReports: closed,
    panel: "admin_moderation",
    newValue: decision === "hide" ? { hiddenReason: "staff" } : { restored },
  });
  return { ok: true };
}
