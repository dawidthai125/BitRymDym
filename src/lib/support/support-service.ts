import "server-only";

import { isUuid } from "@/lib/beats/audio-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { NewThread, SupportKind, SupportMessage, SupportSide, SupportStatus, SupportThread } from "./support-policy";

/** All database access for feedback and bug reports. Callers check who is asking first. */

type ThreadRow = {
  id: string;
  user_id: string;
  kind: SupportKind;
  subject: string;
  status: SupportStatus;
  page_path: string | null;
  browser: string | null;
  created_at: string;
  last_message_at: string;
  last_sender: SupportSide;
  user_unread: number;
  staff_unread: number;
  user_read_at: string | null;
  staff_read_at: string | null;
};

const COLUMNS = "id, user_id, kind, subject, status, page_path, browser, created_at, last_message_at, last_sender, user_unread, staff_unread, user_read_at, staff_read_at";

function toThread(r: ThreadRow): SupportThread {
  return {
    id: r.id,
    kind: r.kind,
    subject: r.subject,
    status: r.status,
    createdAt: r.created_at,
    lastMessageAt: r.last_message_at,
    lastSender: r.last_sender,
    userUnread: r.user_unread,
    staffUnread: r.staff_unread,
    userReadAt: r.user_read_at,
    staffReadAt: r.staff_read_at,
  };
}

export type PostResult =
  | { result: "ok"; threadId: string; notify: boolean; userId: string; kind: SupportKind; subject: string }
  | { result: "limit" | "missing" | "invalid" | "error" };

async function post(args: Record<string, string | null>): Promise<PostResult> {
  const { data, error } = await createSupabaseAdminClient().rpc("support_post_message", args);
  if (error) {
    console.error("[support] post failed", error.message);
    return { result: "error" };
  }
  const r = data as { result: string; thread_id?: string; notify?: boolean; user_id?: string; kind?: SupportKind; subject?: string } | null;
  if (r?.result === "ok" && r.thread_id && r.user_id && r.kind && r.subject) {
    return { result: "ok", threadId: r.thread_id, notify: r.notify === true, userId: r.user_id, kind: r.kind, subject: r.subject };
  }
  return { result: r?.result === "limit" || r?.result === "missing" ? r.result : "invalid" };
}

export function createThread(userId: string, input: NewThread, browser: string | null): Promise<PostResult> {
  return post({
    p_sender: "user", p_author: userId, p_user: userId, p_thread: null, p_body: input.body,
    p_kind: input.kind, p_subject: input.subject, p_page: input.page,
    // The browser name helps to repeat a bug; an opinion does not need it.
    p_browser: input.kind === "bug" ? (browser?.slice(0, 300) ?? null) : null,
  });
}

export function postUserMessage(userId: string, threadId: string, body: string): Promise<PostResult> {
  if (!isUuid(threadId)) return Promise.resolve({ result: "missing" });
  return post({ p_sender: "user", p_author: userId, p_user: userId, p_thread: threadId, p_body: body });
}

export function postStaffMessage(staffId: string, threadId: string, body: string): Promise<PostResult> {
  if (!isUuid(threadId)) return Promise.resolve({ result: "missing" });
  return post({ p_sender: "staff", p_author: staffId, p_user: staffId, p_thread: threadId, p_body: body });
}

export async function listOwnThreads(userId: string): Promise<SupportThread[]> {
  const { data, error } = await createSupabaseAdminClient().from("support_threads").select(COLUMNS)
    .eq("user_id", userId).order("last_message_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ThreadRow[]).map(toThread);
}

export type Conversation = { thread: SupportThread; messages: SupportMessage[] };

async function messagesOf(threadId: string): Promise<SupportMessage[]> {
  // Newest 500, shown oldest first.
  const { data, error } = await createSupabaseAdminClient().from("support_messages").select("id, sender, body, created_at")
    .eq("thread_id", threadId).order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; sender: SupportSide; body: string; created_at: string }[])
    .reverse()
    .map((m) => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.created_at }));
}

async function loadRow(threadId: string): Promise<ThreadRow | null> {
  if (!isUuid(threadId)) return null;
  const { data, error } = await createSupabaseAdminClient().from("support_threads").select(COLUMNS).eq("id", threadId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ThreadRow | null) ?? null;
}

/** Opening the chat marks the other side's messages as read. */
async function open(row: ThreadRow, side: SupportSide): Promise<Conversation> {
  const messages = await messagesOf(row.id);
  const now = new Date().toISOString();
  const patch = side === "user" ? { user_unread: 0, user_read_at: now } : { staff_unread: 0, staff_read_at: now };
  const { error } = await createSupabaseAdminClient().from("support_threads").update(patch).eq("id", row.id);
  if (error) console.error("[support] mark read failed", error.message);
  return { thread: toThread({ ...row, ...(error ? {} : patch) }), messages };
}

/** Only the author's own thread; anything else looks like it does not exist. */
export async function openOwnConversation(userId: string, threadId: string): Promise<Conversation | null> {
  const row = await loadRow(threadId);
  return row && row.user_id === userId ? open(row, "user") : null;
}

export type StaffThread = SupportThread & { userId: string; author: string; userNumber: number | null; email: string | null; page: string | null; browser: string | null };

async function authors(ids: string[]): Promise<Map<string, { name: string; number: number | null }>> {
  const out = new Map<string, { name: string; number: number | null }>();
  if (!ids.length) return out;
  const { data } = await createSupabaseAdminClient().from("profiles").select("id, display_name, user_number").in("id", [...new Set(ids)]);
  for (const p of (data ?? []) as { id: string; display_name: string | null; user_number: number | null }[]) {
    out.set(p.id, { name: p.display_name?.trim() || "—", number: p.user_number });
  }
  return out;
}

function toStaffThread(r: ThreadRow, who: Map<string, { name: string; number: number | null }>, email: string | null = null): StaffThread {
  return { ...toThread(r), userId: r.user_id, author: who.get(r.user_id)?.name ?? "—", userNumber: who.get(r.user_id)?.number ?? null, email, page: r.page_path, browser: r.browser };
}

export async function listStaffThreads(filter: { status: SupportStatus; kind: SupportKind | null }): Promise<StaffThread[]> {
  let q = createSupabaseAdminClient().from("support_threads").select(COLUMNS).eq("status", filter.status);
  if (filter.kind) q = q.eq("kind", filter.kind);
  const { data, error } = await q.order("last_message_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ThreadRow[];
  const who = await authors(rows.map((r) => r.user_id));
  return rows.map((r) => toStaffThread(r, who));
}

export async function openStaffConversation(threadId: string): Promise<(Conversation & { info: StaffThread }) | null> {
  const row = await loadRow(threadId);
  if (!row) return null;
  const admin = createSupabaseAdminClient();
  const [who, user, conversation] = await Promise.all([authors([row.user_id]), admin.auth.admin.getUserById(row.user_id), open(row, "staff")]);
  return { ...conversation, info: toStaffThread(row, who, user.data?.user?.email ?? null) };
}

export async function setThreadStatus(threadId: string, status: SupportStatus): Promise<boolean> {
  if (!isUuid(threadId)) return false;
  const { data, error } = await createSupabaseAdminClient().from("support_threads").update({ status }).eq("id", threadId).select("id");
  return !error && Boolean(data?.length);
}

/** Threads with something new for the staff (admin menu badge). */
export async function countStaffUnread(): Promise<number> {
  const { count, error } = await createSupabaseAdminClient().from("support_threads").select("id", { count: "exact", head: true }).gt("staff_unread", 0);
  return error ? 0 : (count ?? 0);
}

export async function countUserUnread(userId: string): Promise<number> {
  const { count, error } = await createSupabaseAdminClient().from("support_threads").select("id", { count: "exact", head: true }).eq("user_id", userId).gt("user_unread", 0);
  return error ? 0 : (count ?? 0);
}

/** Daily: conversations silent for 24 months are deleted (privacy policy, point 6). */
export async function purgeOldThreads(now = new Date()): Promise<{ removed: number }> {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 24);
  const { data, error } = await createSupabaseAdminClient().from("support_threads").delete().lt("last_message_at", cutoff.toISOString()).select("id");
  if (error) throw new Error(error.message);
  return { removed: data?.length ?? 0 };
}
