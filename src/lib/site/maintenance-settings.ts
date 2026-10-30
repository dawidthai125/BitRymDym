/**
 * Maintenance mode — server reads/writes. SSOT: public.site_settings (id = 1).
 * Writes are ADMIN-only via service_role + admin_audit_events SITE_MAINTENANCE_UPDATE
 * (same pattern as sample-policy-settings). Reads for gating go through the
 * SECURITY DEFINER RPC get_site_maintenance (see middleware).
 */

import "server-only";

import { AuthError, requireRole } from "@/lib/auth/session";
import {
  MAINTENANCE_MESSAGE_MAX,
  MAINTENANCE_OFF,
  parseMaintenanceRpc,
  type MaintenanceState,
} from "@/lib/site/maintenance-gate";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SiteMaintenanceSettings = MaintenanceState & {
  updatedAt: string | null;
  updatedBy: string | null;
};

type Row = {
  maintenance_enabled: boolean;
  maintenance_message: string | null;
  maintenance_until: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

const SELECT =
  "maintenance_enabled, maintenance_message, maintenance_until, updated_at, updated_by";

function mapRow(row: Row): SiteMaintenanceSettings {
  return {
    enabled: row.maintenance_enabled === true,
    message: row.maintenance_message?.trim() || null,
    until: row.maintenance_until,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** Admin panel read (service_role). Fail soft to "site up". */
export async function loadSiteMaintenanceSettings(): Promise<SiteMaintenanceSettings> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("site_settings")
    .select(SELECT)
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("[maintenance] settings load failed:", error.message);
    return { ...MAINTENANCE_OFF, updatedAt: null, updatedBy: null };
  }
  if (!data) return { ...MAINTENANCE_OFF, updatedAt: null, updatedBy: null };
  return mapRow(data as Row);
}

/**
 * Fresh public state + caller's ADMIN flag (RPC, session cookies).
 * Used by sign-in/sign-up actions and the maintenance page. Fails OPEN.
 */
export async function readSiteMaintenanceForViewer(
  /** Pass the client that just signed in so the fresh session is used. */
  client?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<MaintenanceState & { viewerIsAdmin: boolean }> {
  try {
    const supabase = client ?? (await createSupabaseServerClient());
    const { data, error } = await supabase.rpc("get_site_maintenance");
    if (error) throw new Error(error.message);
    return parseMaintenanceRpc(data);
  } catch (error) {
    console.error(
      "[maintenance] state read failed — failing open:",
      error instanceof Error ? error.message : String(error),
    );
    return { ...MAINTENANCE_OFF, viewerIsAdmin: false };
  }
}

export type UpdateSiteMaintenanceInput = {
  enabled: boolean;
  message: string | null;
  /** ISO timestamp or null. */
  until: string | null;
};

/** Pure validation (exported for tests). Returns normalised input or an error. */
export function validateSiteMaintenanceInput(
  input: UpdateSiteMaintenanceInput,
): { ok: true; value: UpdateSiteMaintenanceInput } | { ok: false; error: string } {
  const message = input.message?.trim() ? input.message.trim() : null;
  if (message && message.length > MAINTENANCE_MESSAGE_MAX) {
    return {
      ok: false,
      error: `Komunikat może mieć najwyżej ${MAINTENANCE_MESSAGE_MAX} znaków.`,
    };
  }
  let until: string | null = null;
  if (input.until) {
    const ms = Date.parse(input.until);
    if (Number.isNaN(ms)) {
      return { ok: false, error: "Nieprawidłowa data zakończenia prac." };
    }
    until = new Date(ms).toISOString();
  }
  return { ok: true, value: { enabled: input.enabled === true, message, until } };
}

/** ADMIN-only. Writes the flag and an admin_audit_events row. */
export async function updateSiteMaintenanceSettings(
  input: UpdateSiteMaintenanceInput,
): Promise<SiteMaintenanceSettings> {
  const context = await requireRole(["ADMIN"]);
  const checked = validateSiteMaintenanceInput(input);
  if (!checked.ok) throw new AuthError("FORBIDDEN", checked.error);

  const admin = createSupabaseAdminClient();
  const before = await loadSiteMaintenanceSettings();

  const { data, error } = await admin
    .from("site_settings")
    .upsert(
      {
        id: 1,
        maintenance_enabled: checked.value.enabled,
        maintenance_message: checked.value.message,
        maintenance_until: checked.value.until,
        updated_at: new Date().toISOString(),
        updated_by: context.profile.id,
      },
      { onConflict: "id" },
    )
    .select(SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Nie udało się zapisać trybu prac.");
  }
  const after = mapRow(data as Row);

  const { error: auditError } = await admin.from("admin_audit_events").insert({
    actor_user_id: context.profile.id,
    target_user_id: null,
    actor_user_number: context.profile.userNumber ?? null,
    target_user_number: null,
    action: "SITE_MAINTENANCE_UPDATE",
    old_value: {
      enabled: before.enabled,
      message: before.message,
      until: before.until,
    },
    new_value: { enabled: after.enabled, message: after.message, until: after.until },
    metadata: {},
  });
  if (auditError) {
    // Flag already written; no transaction wrapper (same as sample policy).
    console.error("[maintenance] audit insert failed:", auditError.message);
  }

  return after;
}
