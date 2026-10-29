import "server-only";

import { AuthError } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  BITEK_STORE_LIMITS,
  isBitekStoreMissing,
  mapBitekRow,
  type BitekMessageKind,
  type BitekMessageRole,
  type BitekStoredMessage,
} from "./messages";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function assertOwner(admin: ReturnType<typeof createSupabaseAdminClient>, ownerId: string, projectId: string) {
  if (!UUID.test(projectId)) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
  const { data, error } = await admin.from("studio_projects").select("id").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Projekt nie został znaleziony.");
}

/** Newest-first fetch, returned oldest-first. `available: false` when the migration is not applied. */
export async function listBitekMessages(params: { ownerId: string; projectId: string; limit?: number }): Promise<{
  available: boolean;
  messages: BitekStoredMessage[];
}> {
  const admin = createSupabaseAdminClient();
  await assertOwner(admin, params.ownerId, params.projectId);
  const { data, error } = await admin
    .from("studio_bitek_messages")
    .select("id, role, kind, content, meta, created_at")
    .eq("project_id", params.projectId)
    .eq("owner_id", params.ownerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.min(params.limit ?? BITEK_STORE_LIMITS.listLimit, BITEK_STORE_LIMITS.listLimit));
  if (error) {
    if (isBitekStoreMissing(error)) return { available: false, messages: [] };
    throw new Error(error.message);
  }
  const messages = (data ?? [])
    .map((r) => mapBitekRow(r as Record<string, unknown>))
    .filter((m): m is BitekStoredMessage => m !== null)
    .reverse();
  return { available: true, messages };
}

export async function appendBitekMessages(params: {
  ownerId: string;
  projectId: string;
  rows: { role: BitekMessageRole; kind: BitekMessageKind; content: string; meta?: Record<string, unknown> }[];
  /** Skip the ownership query when the caller already checked it. */
  ownerChecked?: boolean;
}): Promise<{ available: boolean; messages: BitekStoredMessage[] }> {
  const admin = createSupabaseAdminClient();
  if (!params.ownerChecked) await assertOwner(admin, params.ownerId, params.projectId);
  const { data, error } = await admin
    .from("studio_bitek_messages")
    .insert(
      params.rows.map((r) => ({
        project_id: params.projectId,
        owner_id: params.ownerId,
        role: r.role,
        kind: r.kind,
        content: r.content,
        meta: r.meta ?? {},
      })),
    )
    .select("id, role, kind, content, meta, created_at");
  if (error) {
    if (isBitekStoreMissing(error)) return { available: false, messages: [] };
    throw new Error(error.message);
  }
  return {
    available: true,
    messages: (data ?? []).map((r) => mapBitekRow(r as Record<string, unknown>)).filter((m): m is BitekStoredMessage => m !== null),
  };
}
