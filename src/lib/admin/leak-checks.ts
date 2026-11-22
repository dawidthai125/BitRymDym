import "server-only";

import { requireRole } from "@/lib/auth/session";
import { isUuid } from "@/lib/beats/audio-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Admin "Wycieki" (Owner 2026-11-22). The admin uploads a leaked file straight to the private `leak-checks` bucket
 * (signed upload URL, so the 4.5 MB function body limit does not apply); the E3 host matches it against every
 * personal listen copy of the beat (listen-copy-worker runLeakCheck) and stores whose copy it is.
 */
export const LEAK_BUCKET = "leak-checks";
export const LEAK_MAX_BYTES = 50 * 1024 * 1024;

export type LeakMatchView = { copyId: string; userId: string; userNumber: number | null; name: string | null; z: number; match: boolean };
export type LeakCheckView = {
  id: string;
  beatId: string;
  beatTitle: string;
  fileName: string;
  status: "uploading" | "pending" | "working" | "done" | "failed";
  errorCode: string | null;
  createdAt: string;
  matches: LeakMatchView[];
};
export type LeakBeatOption = { id: string; title: string; copies: number };

/** Pure: safe storage name for an uploaded file (keeps the extension; ffmpeg reads by content anyway). */
export function leakFileName(name: string): string {
  const clean = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-80);
  return clean.replace(/^[._]+/, "") || "plik";
}

export async function listLeakBeats(): Promise<LeakBeatOption[]> {
  await requireRole(["ADMIN"]);
  const admin = createSupabaseAdminClient();
  const [{ data: beats, error }, { data: copies, error: cErr }] = await Promise.all([
    admin.from("beats").select("id, title").eq("status", "PUBLISHED").order("title"),
    admin.from("beat_listen_copies").select("beat_id"),
  ]);
  if (error || cErr) throw new Error("leak_beats_load_failed");
  const count = new Map<string, number>();
  for (const c of copies ?? []) count.set(c.beat_id as string, (count.get(c.beat_id as string) ?? 0) + 1);
  return (beats ?? []).map((b) => ({ id: b.id as string, title: (b.title as string) || "—", copies: count.get(b.id as string) ?? 0 }));
}

export async function listLeakChecks(limit = 20): Promise<LeakCheckView[]> {
  await requireRole(["ADMIN"]);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("leak_checks")
    .select("id, beat_id, file_name, status, error_code, created_at, result, beats(title)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("leak_checks_load_failed");
  return (data ?? []).map((r) => {
    const beat = r.beats as { title?: string } | { title?: string }[] | null;
    const title = Array.isArray(beat) ? beat[0]?.title : beat?.title;
    const result = r.result as { matches?: LeakMatchView[] } | null;
    return {
      id: r.id as string,
      beatId: r.beat_id as string,
      beatTitle: title || "—",
      fileName: r.file_name as string,
      status: r.status as LeakCheckView["status"],
      errorCode: (r.error_code as string | null) ?? null,
      createdAt: r.created_at as string,
      matches: Array.isArray(result?.matches) ? result.matches : [],
    };
  });
}

export type StartLeakCheckResult = { ok: true; checkId: string; uploadUrl: string } | { ok: false; code: "INVALID" | "TOO_BIG" | "FAILED" };

export async function startLeakCheck(input: { beatId: string; fileName: string; size: number }): Promise<StartLeakCheckResult> {
  const ctx = await requireRole(["ADMIN"]);
  if (!isUuid(input.beatId) || typeof input.fileName !== "string" || !input.fileName.trim()) return { ok: false, code: "INVALID" };
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, code: "INVALID" };
  if (input.size > LEAK_MAX_BYTES) return { ok: false, code: "TOO_BIG" };
  const admin = createSupabaseAdminClient();
  const id = crypto.randomUUID();
  const objectKey = `${id}/${leakFileName(input.fileName)}`;
  const { error } = await admin.from("leak_checks").insert({
    id,
    beat_id: input.beatId,
    created_by: ctx.userId,
    file_name: input.fileName.trim().slice(0, 200),
    object_key: objectKey,
  });
  if (error) return { ok: false, code: "FAILED" };
  const { data: signed, error: sErr } = await admin.storage.from(LEAK_BUCKET).createSignedUploadUrl(objectKey);
  if (sErr || !signed?.signedUrl) {
    await admin.from("leak_checks").delete().eq("id", id);
    return { ok: false, code: "FAILED" };
  }
  return { ok: true, checkId: id, uploadUrl: signed.signedUrl };
}

/** After the browser finished the upload: queue the check for the E3 host. */
export async function confirmLeakCheck(checkId: string): Promise<{ ok: boolean }> {
  await requireRole(["ADMIN"]);
  if (!isUuid(checkId)) return { ok: false };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("leak_checks")
    .update({ status: "pending" })
    .eq("id", checkId)
    .eq("status", "uploading")
    .select("id");
  return { ok: !error && (data?.length ?? 0) === 1 };
}
