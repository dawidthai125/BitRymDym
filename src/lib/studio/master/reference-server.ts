import "server-only";

/**
 * Reference mastering — access check (plan + add-on entitlement) and the upload
 * lifecycle for the API. Flow: prepare (gate, validate, one active reference per
 * project, signed upload URL per ≤40 MiB part) → browser uploads → finalize (objects
 * exist + sizes add up → ready) → commit master with referenceId → E3 uses it once
 * and deletes it. Unused uploads expire after 24 h (E3 sweep).
 */
import { randomUUID } from "node:crypto";

import { AuthError } from "@/lib/auth/session";
import { PLAN_POLICY, referenceMasteringGate, type ReferenceMasteringGate } from "@/config/plan-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PremiumTier } from "@/types/premium";

import { partName, PART_BYTES } from "./parts";
import { REFERENCE_CONTENT_TYPE, referenceObjectKey, validateReferenceUpload } from "./reference";
import { REFERENCE_BUCKET, REFERENCE_COLUMNS, deleteStudioReference, type StudioReferenceRow } from "./reference-store";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const missing = (e: { code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703");

export type ReferenceView = { id: string; fileName: string; format: "mp3" | "wav"; durationMs: number; byteSize: number; status: "pending" | "ready"; expiresAt: string };
const refView = (r: StudioReferenceRow): ReferenceView => ({
  id: r.id, fileName: r.file_name, format: r.format, durationMs: r.duration_ms, byteSize: r.byte_size, status: r.status as "pending" | "ready", expiresAt: r.expires_at,
});

/** Active add-on row (not revoked, started, not ended). Missing table → no add-on. */
export async function hasPlanAddon(admin: Admin, userId: string, addon: "reference_mastering"): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await admin.from("plan_addon_entitlements").select("id").eq("user_id", userId).eq("addon", addon)
    .is("revoked_at", null).lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`).limit(1);
  if (error) {
    if (missing(error)) return false;
    throw new Error("addon_check_failed");
  }
  return (data ?? []).length > 0;
}

export async function referenceGateFor(admin: Admin, userId: string, tier: PremiumTier): Promise<ReferenceMasteringGate> {
  const needsAddon = PLAN_POLICY[tier].mastering.referenceMastering === "addon";
  return referenceMasteringGate(tier, needsAddon ? await hasPlanAddon(admin, userId, "reference_mastering") : false);
}

async function assertProject(admin: Admin, ownerId: string, projectId: string) {
  if (!UUID.test(projectId)) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  const { data, error } = await admin.from("studio_projects").select("id").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
}

/** Current (ready or still uploading, unexpired) reference of this project, if any. */
async function activeReferences(admin: Admin, ownerId: string, projectId: string): Promise<StudioReferenceRow[] | null> {
  const { data, error } = await admin.from("studio_master_references").select(REFERENCE_COLUMNS).eq("owner_id", ownerId).eq("project_id", projectId)
    .neq("status", "deleted").order("created_at", { ascending: false }).limit(10);
  if (missing(error)) return null;
  if (error) throw new Error("reference_read_failed");
  return (data ?? []) as StudioReferenceRow[];
}

export type ReferenceState = { available: boolean; gate: ReferenceMasteringGate; reference: ReferenceView | null };

export async function getStudioReferenceState(p: { ownerId: string; projectId: string; tier: PremiumTier }): Promise<ReferenceState> {
  const admin = createSupabaseAdminClient();
  await assertProject(admin, p.ownerId, p.projectId);
  const gate = await referenceGateFor(admin, p.ownerId, p.tier);
  const rows = await activeReferences(admin, p.ownerId, p.projectId);
  if (rows === null) return { available: false, gate, reference: null };
  const now = Date.now();
  const ready = rows.find((r) => r.status === "ready" && Date.parse(r.expires_at) > now);
  return { available: true, gate, reference: ready ? refView(ready) : null };
}

export type PrepareReferenceResult =
  | { ok: true; referenceId: string; uploads: { path: string; token: string; contentType: string }[]; partBytes: number }
  | { ok: false; error: "reference_locked" | "addon_missing" | "bad_format" | "too_big" | "too_long" | "too_short" | "bad_request" | "not_available" };

export async function prepareStudioReference(p: { ownerId: string; projectId: string; tier: PremiumTier; body: Record<string, unknown> }): Promise<PrepareReferenceResult> {
  const admin = createSupabaseAdminClient();
  await assertProject(admin, p.ownerId, p.projectId);
  const gate = await referenceGateFor(admin, p.ownerId, p.tier);
  if (!gate.allowed) return { ok: false, error: gate.reason === "addon_missing" ? "addon_missing" : "reference_locked" };
  const v = validateReferenceUpload({ fileName: p.body.fileName, mime: p.body.mime, byteSize: p.body.byteSize, durationMs: p.body.durationMs });
  if (!v.ok) return { ok: false, error: v.error };
  const old = await activeReferences(admin, p.ownerId, p.projectId);
  if (old === null) return { ok: false, error: "not_available" };
  // One reference per project: a new upload replaces (and deletes) the previous one.
  for (const r of old) await deleteStudioReference(r).catch(() => {});
  const id = randomUUID();
  const key = referenceObjectKey(p.ownerId, p.projectId, id, v.value.format);
  const { error } = await admin.from("studio_master_references").insert({
    id, owner_id: p.ownerId, project_id: p.projectId, object_key: key, file_name: v.value.fileName, format: v.value.format,
    byte_size: v.value.byteSize, parts: v.value.parts, duration_ms: v.value.durationMs, status: "pending",
  });
  if (error) {
    if (missing(error)) return { ok: false, error: "not_available" };
    throw new Error("reference_insert_failed");
  }
  const storage = admin.storage.from(REFERENCE_BUCKET);
  const uploads: { path: string; token: string; contentType: string }[] = [];
  for (let i = 0; i < v.value.parts; i++) {
    const path = v.value.parts === 1 ? key : partName(key, i);
    const { data, error: se } = await storage.createSignedUploadUrl(path);
    if (se || !data?.token) throw new Error("reference_upload_url_failed");
    uploads.push({ path: data.path ?? path, token: data.token, contentType: REFERENCE_CONTENT_TYPE[v.value.format] });
  }
  return { ok: true, referenceId: id, uploads, partBytes: PART_BYTES };
}

/** After the browser upload: every part is there and the sizes add up → ready. */
export async function finalizeStudioReference(p: { ownerId: string; projectId: string; tier: PremiumTier; referenceId: unknown }): Promise<{ ok: true; reference: ReferenceView } | { ok: false; error: "reference_invalid" | "reference_locked" | "addon_missing" | "upload_incomplete" }> {
  const admin = createSupabaseAdminClient();
  await assertProject(admin, p.ownerId, p.projectId);
  if (typeof p.referenceId !== "string" || !UUID.test(p.referenceId)) return { ok: false, error: "reference_invalid" };
  const gate = await referenceGateFor(admin, p.ownerId, p.tier);
  if (!gate.allowed) return { ok: false, error: gate.reason === "addon_missing" ? "addon_missing" : "reference_locked" };
  const { data } = await admin.from("studio_master_references").select(REFERENCE_COLUMNS).eq("id", p.referenceId)
    .eq("owner_id", p.ownerId).eq("project_id", p.projectId).maybeSingle();
  const row = data as StudioReferenceRow | null;
  if (!row || row.status === "deleted" || Date.parse(row.expires_at) < Date.now()) return { ok: false, error: "reference_invalid" };
  if (row.status === "ready") return { ok: true, reference: refView(row) };
  const dir = row.object_key.slice(0, row.object_key.lastIndexOf("/"));
  const base = row.object_key.slice(row.object_key.lastIndexOf("/") + 1);
  const { data: files } = await admin.storage.from(REFERENCE_BUCKET).list(dir, { limit: 100 });
  const want = row.parts === 1 ? [base] : Array.from({ length: row.parts }, (_, i) => partName(base, i));
  const sizes = new Map((files ?? []).map((f) => [f.name, Number((f.metadata as { size?: number } | null)?.size ?? -1)]));
  const total = want.reduce((n, w) => n + (sizes.get(w) ?? Number.NaN), 0);
  if (!Number.isFinite(total) || total !== row.byte_size) return { ok: false, error: "upload_incomplete" };
  const { data: up, error } = await admin.from("studio_master_references").update({ status: "ready" }).eq("id", row.id).eq("status", "pending").select(REFERENCE_COLUMNS).maybeSingle();
  if (error || !up) return { ok: false, error: "reference_invalid" };
  return { ok: true, reference: refView(up as StudioReferenceRow) };
}

export async function deleteStudioReferenceForOwner(p: { ownerId: string; projectId: string; referenceId: unknown }): Promise<{ ok: boolean }> {
  const admin = createSupabaseAdminClient();
  await assertProject(admin, p.ownerId, p.projectId);
  if (typeof p.referenceId !== "string" || !UUID.test(p.referenceId)) return { ok: false };
  const { data } = await admin.from("studio_master_references").select("id, object_key").eq("id", p.referenceId)
    .eq("owner_id", p.ownerId).eq("project_id", p.projectId).maybeSingle();
  if (!data) return { ok: false };
  await deleteStudioReference(data as Pick<StudioReferenceRow, "id" | "object_key">);
  return { ok: true };
}
