import "server-only";

/**
 * Gaps P1 — private listen links (service_role, owner-checked).
 * Owner: list / create (approved master only, plan cap via atomic RPC) / revoke.
 * Public: resolve a token → link + master object keys; rate limit per link + per IP.
 * Missing tables (migration not applied) → `{ available: false }`.
 */
import { randomUUID } from "node:crypto";

import { listenLinksForTier } from "@/config/plan-policy";
import { AuthError } from "@/lib/auth/session";
import { partsOf } from "@/lib/studio/master/parts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleKey } from "@/lib/supabase/env";
import type { PremiumTier } from "@/types/premium";

import {
  decideListenCreate,
  hashListenToken,
  LISTEN_RATE,
  LISTEN_TOKEN_RE,
  listenDayOptions,
  listenLinkState,
  listenTokenFor,
  type ListenLinkState,
} from "./listen-policy";

const BUCKET = "audio-artifacts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Admin = ReturnType<typeof createSupabaseAdminClient>;

export class ListenLinksUnavailable extends Error {}
const missing = (e: { code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42883");
function check(e: { code?: string; message?: string } | null) {
  if (!e) return;
  if (missing(e)) throw new ListenLinksUnavailable();
  throw new Error(`listen_db:${e.code ?? "?"}`);
}

function secret(): string {
  const s = process.env.STUDIO_LISTEN_LINK_SECRET?.trim() || getSupabaseServiceRoleKey();
  if (!s) throw new Error("listen_secret_missing");
  return s;
}

export type ListenLinkView = {
  id: string; url: string; title: string; createdAt: string; expiresAt: string;
  revokedAt: string | null; playCount: number; lastPlayedAt: string | null; state: ListenLinkState;
};

async function view(r: Record<string, unknown>, origin: string): Promise<ListenLinkView> {
  const id = String(r.id);
  const v = {
    id, title: String(r.title ?? ""), createdAt: String(r.created_at), expiresAt: String(r.expires_at),
    revokedAt: (r.revoked_at as string | null) ?? null, playCount: Number(r.play_count ?? 0),
    lastPlayedAt: (r.last_played_at as string | null) ?? null,
  };
  return { ...v, url: `${origin}/listen/${await listenTokenFor(secret(), id)}`, state: listenLinkState(v) };
}

async function assertOwner(admin: Admin, ownerId: string, projectId: string) {
  if (!UUID.test(projectId)) throw new AuthError("FORBIDDEN", "bad_request");
  const { data, error } = await admin.from("studio_projects").select("id, title").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error("listen_db");
  if (!data) throw new AuthError("FORBIDDEN", "not_found");
  return data as { id: string; title: string | null };
}

/** Approved master of the project, only while the project is unchanged since (same rule as delivery). */
async function approvedMaster(admin: Admin, ownerId: string, projectId: string) {
  const { data: proj } = await admin.from("studio_projects").select("document_version").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  const { data, error } = await admin.from("studio_master_jobs").select("id, result_object_key, source_document_version")
    .eq("project_id", projectId).eq("owner_id", ownerId).eq("kind", "master").eq("status", "succeeded")
    .not("approved_at", "is", null).order("approved_at", { ascending: false }).limit(1).maybeSingle();
  check(error);
  const row = data as { id: string; result_object_key: string | null; source_document_version: number } | null;
  if (!row?.result_object_key) return null;
  if (Number((proj as { document_version?: number } | null)?.document_version ?? -1) !== Number(row.source_document_version)) return null;
  return row;
}

async function activeCount(admin: Admin, ownerId: string): Promise<number> {
  const { count, error } = await admin.from("studio_listen_links").select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId).is("revoked_at", null).gt("expires_at", new Date().toISOString());
  check(error);
  return count ?? 0;
}

export async function listListenLinks(p: { ownerId: string; projectId: string; tier: PremiumTier; origin: string }) {
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  const { data, error } = await admin.from("studio_listen_links").select("*").eq("owner_id", p.ownerId).eq("project_id", p.projectId)
    .order("created_at", { ascending: false }).limit(50);
  check(error);
  const links = await Promise.all((data ?? []).map((r) => view(r as Record<string, unknown>, p.origin)));
  const approved = await approvedMaster(admin, p.ownerId, p.projectId);
  return {
    available: true as const,
    approved: !!approved,
    links,
    limits: { active: await activeCount(admin, p.ownerId), maxActive: listenLinksForTier(p.tier).listenLinksActive, dayOptions: listenDayOptions(p.tier) },
  };
}

export async function createListenLink(p: { ownerId: string; projectId: string; tier: PremiumTier; days: unknown; origin: string }) {
  const admin = createSupabaseAdminClient();
  const project = await assertOwner(admin, p.ownerId, p.projectId);
  const approved = await approvedMaster(admin, p.ownerId, p.projectId);
  if (!approved) return { ok: false as const, error: "not_approved" };
  const d = decideListenCreate({ tier: p.tier, active: await activeCount(admin, p.ownerId), days: p.days });
  if (!d.allowed) return { ok: false as const, error: d.reason };
  const id = randomUUID();
  const tokenHash = await hashListenToken(await listenTokenFor(secret(), id));
  const { data, error } = await admin.rpc("create_studio_listen_link", {
    p_id: id, p_owner: p.ownerId, p_project: p.projectId, p_master_job: approved.id, p_token_hash: tokenHash,
    p_title: (project.title ?? "").slice(0, 120), p_expires_at: new Date(Date.now() + d.days * 86400_000).toISOString(),
    p_max_active: listenLinksForTier(p.tier).listenLinksActive,
  });
  if (error && /LISTEN_LINK_LIMIT/.test(error.message ?? "")) return { ok: false as const, error: "limit" };
  check(error);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  return { ok: true as const, link: await view(row, p.origin) };
}

export async function revokeListenLink(p: { ownerId: string; projectId: string; linkId: string }) {
  if (!UUID.test(p.linkId)) throw new AuthError("FORBIDDEN", "bad_request");
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, p.ownerId, p.projectId);
  const { data, error } = await admin.from("studio_listen_links").update({ revoked_at: new Date().toISOString() })
    .eq("id", p.linkId).eq("owner_id", p.ownerId).eq("project_id", p.projectId).is("revoked_at", null).select("id");
  check(error);
  return { ok: true as const, revoked: (data ?? []).length > 0 };
}

// ---------------------------------------------------------------- public side

export type ResolvedListenLink = { linkId: string; title: string; expiresAt: string; objectKey: string };

/** Token → active link of a still-existing approved master; null for anything else (no oracle). */
export async function resolveListenToken(token: string): Promise<ResolvedListenLink | null> {
  if (!LISTEN_TOKEN_RE.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("studio_listen_links").select("id, title, expires_at, revoked_at, master_job_id")
    .eq("token_hash", await hashListenToken(token)).maybeSingle();
  if (error) {
    if (missing(error)) return null;
    throw new Error("listen_db");
  }
  const link = data as { id: string; title: string; expires_at: string; revoked_at: string | null; master_job_id: string } | null;
  if (!link || listenLinkState({ expiresAt: link.expires_at, revokedAt: link.revoked_at }) !== "active") return null;
  const { data: job } = await admin.from("studio_master_jobs").select("result_object_key, status, approved_at").eq("id", link.master_job_id).maybeSingle();
  const j = job as { result_object_key: string | null; status: string; approved_at: string | null } | null;
  if (!j?.result_object_key || j.status !== "succeeded" || !j.approved_at) return null;
  return { linkId: link.id, title: link.title, expiresAt: link.expires_at, objectKey: j.result_object_key };
}

/** Sliding-window rate limit (per link and per hashed client IP). Fails closed on DB errors. */
export async function allowListenHit(linkId: string, clientIp: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const ipHash = (await hashListenToken(`ip:${clientIp}`)).slice(0, 32);
  for (const [bucket, r] of [[`l:${linkId}`, LISTEN_RATE.link], [`i:${ipHash}`, LISTEN_RATE.ip]] as const) {
    const { data, error } = await admin.rpc("studio_listen_hit", { p_bucket: bucket, p_limit: r.limit, p_window_seconds: r.windowSeconds });
    if (error || data !== true) return false;
  }
  return true;
}

export async function countListenPlay(linkId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("studio_listen_links").select("play_count").eq("id", linkId).maybeSingle();
  const n = Number((data as { play_count?: number } | null)?.play_count ?? 0);
  await admin.from("studio_listen_links").update({ play_count: n + 1, last_played_at: new Date().toISOString() }).eq("id", linkId);
}

/** Ordered storage keys of the master (whole object, or its .pNNN parts). */
export async function listenObjectKeys(objectKey: string): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const dir = objectKey.slice(0, objectKey.lastIndexOf("/"));
  const base = objectKey.slice(objectKey.lastIndexOf("/") + 1);
  const { data, error } = await admin.storage.from(BUCKET).list(dir, { limit: 1000 });
  if (error) return [];
  return partsOf((data ?? []).map((f) => f.name), base).map((n) => `${dir}/${n}`);
}

export async function signListenObject(key: string, seconds: number): Promise<string | null> {
  const { data } = await createSupabaseAdminClient().storage.from(BUCKET).createSignedUrl(key, seconds);
  return data?.signedUrl ?? null;
}

export async function downloadListenObject(key: string): Promise<Blob | null> {
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).download(key);
  return error ? null : data;
}
