import "server-only";

/**
 * Rights reports and staff takedowns (owner decision 2026-11-26, DSA art. 16 notice-and-action).
 * Anyone (also without an account) reports a public work, beat or sample. Staff see open reports,
 * catalogue works held by the rights check, and can take a work down, release a held work,
 * hide a sample or archive a beat.
 */
import { createHash } from "node:crypto";

import { Resend } from "resend";

import { isUuid } from "@/lib/beats/audio-validation";
import { requireRole } from "@/lib/auth/session";
import { getResendEnv } from "@/lib/email/resend-env";
import { escapeHtml } from "@/lib/email/html-escape";
import { adminRemoveCatalogSample } from "@/lib/studio/samples/sample-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const REPORT_KINDS = ["work", "beat", "sample"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_REASONS = ["copyright", "stolen_beat", "stolen_vocal", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Reports per connection per hour (spam guard; a real rights holder can always write by e-mail). */
export const REPORTS_PER_HOUR = 5;
const STAFF_INBOX = "kontakt@bitrymdym.pl";

export type ReportInput = {
  kind: unknown;
  id: unknown;
  reason: unknown;
  details: unknown;
  name: unknown;
  email: unknown;
  goodFaith: unknown;
};

export type CleanReport = {
  kind: ReportKind;
  id: string;
  reason: ReportReason;
  details: string;
  name: string;
  email: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Pure validation (unit tested). */
export function cleanReport(input: ReportInput): CleanReport | null {
  const kind = REPORT_KINDS.find((k) => k === input.kind);
  const reason = REPORT_REASONS.find((r) => r === input.reason);
  if (!kind || !reason || typeof input.id !== "string" || !isUuid(input.id)) return null;
  if (input.goodFaith !== true) return null;
  const details = typeof input.details === "string" ? input.details.trim().slice(0, 4000) : "";
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  const email = typeof input.email === "string" ? input.email.trim().slice(0, 200) : "";
  if (details.length < 10 || name.length < 2 || !EMAIL_RE.test(email)) return null;
  return { kind, id: input.id.toLowerCase(), reason, details, name, email };
}

export function hashReporterIp(ip: string): string {
  return createHash("sha256").update(`brd-report:${ip}`).digest("hex").slice(0, 32);
}

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Only public, live content can be reported here (anything else: e-mail). */
async function targetTitle(admin: Admin, kind: ReportKind, id: string): Promise<string | null> {
  if (kind === "work") {
    const r = await admin.from("catalog_works").select("title").eq("id", id).is("withdrawn_at", null).maybeSingle();
    return r.data ? String(r.data.title) : null;
  }
  if (kind === "beat") {
    const r = await admin.from("beats").select("title").eq("id", id).eq("status", "PUBLISHED").maybeSingle();
    return r.data ? String(r.data.title ?? "") : null;
  }
  const r = await admin.from("studio_samples").select("title").eq("id", id).eq("status", "PUBLISHED").maybeSingle();
  return r.data ? String(r.data.title ?? "") : null;
}

export async function submitContentReport(input: ReportInput & { userId: string | null; ip: string }): Promise<"ok" | "invalid" | "missing" | "limit" | "error"> {
  const report = cleanReport(input);
  if (!report) return "invalid";
  let admin: Admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return "error";
  }
  const ipHash = hashReporterIp(input.ip || "unknown");
  const since = new Date(Date.now() - 3600_000).toISOString();
  const recent = await admin.from("content_reports").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
  if (recent.error) return "error";
  if ((recent.count ?? 0) >= REPORTS_PER_HOUR) return "limit";
  const title = await targetTitle(admin, report.kind, report.id);
  if (title == null) return "missing";
  const saved = await admin.from("content_reports").insert({
    target_kind: report.kind,
    target_id: report.id,
    reason: report.reason,
    details: report.details,
    reporter_id: input.userId,
    reporter_name: report.name,
    reporter_email: report.email,
    good_faith: true,
    ip_hash: ipHash,
  });
  if (saved.error) return "error";
  await notifyStaff(report, title).catch(() => undefined);
  return "ok";
}

async function notifyStaff(report: CleanReport, title: string): Promise<void> {
  const env = getResendEnv();
  if (!env.isConfigured || !env.apiKey || !env.from) return;
  const path = report.kind === "work" ? `/utwor/${report.id}` : report.kind === "beat" ? `/beat/${report.id}` : `/sampel/${report.id}`;
  const lines = [
    `Nowe zgłoszenie naruszenia praw (${report.reason}).`,
    `Treść: ${title} — https://www.bitrymdym.pl${path}`,
    `Zgłasza: ${report.name} <${report.email}>`,
    "",
    report.details,
    "",
    "Panel: https://www.bitrymdym.pl/admin/prawa",
  ];
  await new Resend(env.apiKey).emails.send({
    from: env.from,
    to: STAFF_INBOX,
    replyTo: report.email,
    subject: `Zgłoszenie praw: ${title}`.slice(0, 120),
    text: lines.join("\n"),
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(lines.join("\n"))}</pre>`,
  });
}

// ---------------------------------------------------------------- staff

export type StaffReport = {
  id: string;
  kind: ReportKind;
  targetId: string;
  title: string | null;
  reason: ReportReason;
  details: string;
  name: string | null;
  email: string | null;
  createdAt: string;
};

export type HeldWork = {
  id: string;
  title: string;
  ownerId: string;
  projectId: string;
  status: "pending" | "running" | "held";
  summary: string | null;
  reasons: string[];
  requestedAt: string | null;
  /** Waiting longer than 30 minutes: the worker is probably down. */
  stale: boolean;
};

export type UploadBlockRow = {
  id: number; createdAt: string; ownerId: string | null; uploadKind: string; matchKind: string;
  score: number | null; matchedSeconds: number | null;
};

/** Blocklist size (taken-down files) and the latest refused uploads (moderation log, 2026-11-26). */
export type BlocklistDesk = {
  blocked: number; pending: number; events: UploadBlockRow[];
  /** New uploads still waiting for the acoustic screen after 5 minutes: the E3 upload-screen worker is probably down. */
  staleScreens: number;
};

export type RightsDesk = { reports: StaffReport[]; works: HeldWork[]; blocklist: BlocklistDesk };

async function loadBlocklistDesk(admin: Admin): Promise<BlocklistDesk> {
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const [all, pending, events, stale] = await Promise.all([
    admin.from("blocked_audio_fingerprints").select("id", { count: "exact", head: true }),
    admin.from("blocked_audio_fingerprints").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("upload_block_events").select("id, created_at, owner_id, upload_kind, match_kind, score, matched_seconds").order("created_at", { ascending: false }).limit(50),
    admin.from("takes").select("id", { count: "exact", head: true }).eq("screen_status", "pending").lt("updated_at", staleBefore),
  ]);
  // Before the migration the tables are missing: show an empty log instead of failing the desk.
  if (all.error || pending.error || events.error) return { blocked: 0, pending: 0, events: [], staleScreens: 0 };
  return {
    staleScreens: stale.error ? 0 : (stale.count ?? 0),
    blocked: all.count ?? 0,
    pending: pending.count ?? 0,
    events: ((events.data ?? []) as Array<{ id: number; created_at: string; owner_id: string | null; upload_kind: string; match_kind: string; score: number | null; matched_seconds: number | null }>).map((e) => ({
      id: e.id, createdAt: e.created_at, ownerId: e.owner_id, uploadKind: e.upload_kind, matchKind: e.match_kind,
      score: e.score == null ? null : Number(e.score), matchedSeconds: e.matched_seconds == null ? null : Number(e.matched_seconds),
    })),
  };
}

async function titles(admin: Admin, kind: ReportKind, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const table = kind === "work" ? "catalog_works" : kind === "beat" ? "beats" : "studio_samples";
  const r = await admin.from(table).select("id, title").in("id", ids);
  return new Map((r.data ?? []).map((x) => [String(x.id), String(x.title ?? "")]));
}

export async function loadRightsDesk(): Promise<RightsDesk> {
  await requireRole(["ADMIN"]);
  const admin = createSupabaseAdminClient();
  const [reports, works] = await Promise.all([
    admin
      .from("content_reports")
      .select("id, target_kind, target_id, reason, details, reporter_name, reporter_email, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(200),
    admin
      .from("catalog_works")
      .select("id, title, owner_id, project_id, check_status, check_summary, check_result, check_requested_at")
      .in("check_status", ["pending", "running", "held"])
      .order("check_requested_at", { ascending: true })
      .limit(200),
  ]);
  if (reports.error || works.error) throw new Error("rights_desk_load_failed");
  const blocklist = await loadBlocklistDesk(admin);
  const rows = (reports.data ?? []) as Array<{ id: string; target_kind: ReportKind; target_id: string; reason: ReportReason; details: string; reporter_name: string | null; reporter_email: string | null; created_at: string }>;
  const names = new Map<string, string>();
  for (const kind of REPORT_KINDS) {
    const m = await titles(admin, kind, rows.filter((r) => r.target_kind === kind).map((r) => r.target_id));
    for (const [k, v] of m) names.set(`${kind}:${k}`, v);
  }
  return {
    blocklist,
    reports: rows.map((r) => ({
      id: r.id, kind: r.target_kind, targetId: r.target_id, title: names.get(`${r.target_kind}:${r.target_id}`) ?? null,
      reason: r.reason, details: r.details, name: r.reporter_name, email: r.reporter_email, createdAt: r.created_at,
    })),
    works: ((works.data ?? []) as Array<{ id: string; title: string; owner_id: string; project_id: string; check_status: HeldWork["status"]; check_summary: string | null; check_result: { reasons?: unknown } | null; check_requested_at: string | null }>).map((w) => ({
      id: w.id, title: w.title, ownerId: w.owner_id, projectId: w.project_id, status: w.check_status, summary: w.check_summary,
      reasons: Array.isArray(w.check_result?.reasons) ? (w.check_result!.reasons as unknown[]).map(String).slice(0, 8) : [],
      requestedAt: w.check_requested_at,
      stale: w.check_status !== "held" && !!w.check_requested_at && Date.now() - new Date(w.check_requested_at).getTime() > 30 * 60_000,
    })),
  };
}

export type StaffOutcome = { ok: true } | { ok: false; message: string };

/** Held work → live (staff checked the rights). */
export async function staffReleaseWork(workId: string, note: string): Promise<StaffOutcome> {
  const ctx = await requireRole(["ADMIN"]);
  if (!isUuid(workId)) return { ok: false, message: "Zły identyfikator." };
  const now = new Date().toISOString();
  const r = await createSupabaseAdminClient()
    .from("catalog_works")
    .update({ check_status: "passed", withdrawn_at: null, published_at: now, staff_note: note.slice(0, 500) || null, staff_by: ctx.userId, staff_at: now })
    .eq("id", workId)
    .in("check_status", ["held", "pending", "running"])
    .select("id");
  if (r.error) return { ok: false, message: "Nie udało się zapisać." };
  if (!r.data?.length) return { ok: false, message: "Utwór nie czeka już na decyzję." };
  await createSupabaseAdminClient().rpc("catalog_withdraw_older_versions", { p_work_id: workId });
  return { ok: true };
}

/** Take a work out of the catalogue for good (held: rejected; live: removed). The owner cannot republish this master. */
export async function staffRemoveWork(workId: string, note: string): Promise<StaffOutcome> {
  const ctx = await requireRole(["ADMIN"]);
  if (!isUuid(workId)) return { ok: false, message: "Zły identyfikator." };
  const admin = createSupabaseAdminClient();
  const cur = await admin.from("catalog_works").select("check_status").eq("id", workId).maybeSingle();
  if (cur.error || !cur.data) return { ok: false, message: "Nie ma takiego utworu." };
  const now = new Date().toISOString();
  const held = ["held", "pending", "running"].includes(String(cur.data.check_status));
  const r = await admin
    .from("catalog_works")
    .update({ check_status: held ? "rejected" : "removed", withdrawn_at: now, in_rankings: false, staff_note: note.slice(0, 500) || null, staff_by: ctx.userId, staff_at: now })
    .eq("id", workId)
    .select("id");
  if (r.error || !r.data?.length) return { ok: false, message: "Nie udało się zapisać." };
  return { ok: true };
}

/**
 * Take a catalogue sample down: the existing admin removal (status PRIVATE, catalogue copy deleted;
 * a platform sample is deleted). The owner cannot list it again without a new review.
 */
export async function staffHideSample(sampleId: string, note: string): Promise<StaffOutcome> {
  await requireRole(["ADMIN"]);
  if (!isUuid(sampleId)) return { ok: false, message: "Zły identyfikator." };
  const out = await adminRemoveCatalogSample(sampleId);
  if (!out.ok) return { ok: false, message: out.error };
  if (out.removed === "unlisted") {
    await createSupabaseAdminClient()
      .from("studio_samples")
      .update({ moderation_note: (note || "Zdjęty po zgłoszeniu praw.").slice(0, 500) })
      .eq("id", sampleId);
  }
  return { ok: true };
}

export async function staffCloseReport(reportId: string, status: "removed" | "rejected", note: string): Promise<StaffOutcome> {
  const ctx = await requireRole(["ADMIN"]);
  if (!isUuid(reportId)) return { ok: false, message: "Zły identyfikator." };
  const r = await createSupabaseAdminClient()
    .from("content_reports")
    .update({ status, staff_note: note.slice(0, 500) || null, handled_by: ctx.userId, handled_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("status", "open")
    .select("id");
  if (r.error) return { ok: false, message: "Nie udało się zapisać." };
  if (!r.data?.length) return { ok: false, message: "Zgłoszenie jest już zamknięte." };
  return { ok: true };
}
