/**
 * P1 — durable Admin overrides for BRONZE/SILVER/GOLD max recording seconds.
 * DB table sample_policy_settings is SSOT. service_role only.
 */

import "server-only";

import {
  RECORDING_GLOBAL_MAX_SECONDS,
  SAMPLE_POLICY_DEFAULTS,
} from "@/config/recording";
import { AuthError, requireRole } from "@/lib/auth/session";
import {
  validateAdminRecordingDurationSeconds,
  type SamplePolicyDurationOverrides,
} from "@/lib/takes/entitlement";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SamplePolicySettingsRow = {
  bronzeMaxRecordingSeconds: number;
  silverMaxRecordingSeconds: number;
  goldMaxRecordingSeconds: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

const DEFAULTS: SamplePolicySettingsRow = {
  bronzeMaxRecordingSeconds:
    SAMPLE_POLICY_DEFAULTS.BRONZE.maxRecordingSeconds,
  silverMaxRecordingSeconds:
    SAMPLE_POLICY_DEFAULTS.SILVER.maxRecordingSeconds,
  goldMaxRecordingSeconds: SAMPLE_POLICY_DEFAULTS.GOLD.maxRecordingSeconds,
  updatedAt: null,
  updatedBy: null,
};

function mapRow(data: {
  bronze_max_recording_seconds: number;
  silver_max_recording_seconds: number;
  gold_max_recording_seconds: number;
  updated_at: string | null;
  updated_by: string | null;
}): SamplePolicySettingsRow {
  return {
    bronzeMaxRecordingSeconds: data.bronze_max_recording_seconds,
    silverMaxRecordingSeconds: data.silver_max_recording_seconds,
    goldMaxRecordingSeconds: data.gold_max_recording_seconds,
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
  };
}

/** Read overrides for policy resolver (fail soft to code defaults). */
export async function loadSamplePolicyDurationOverrides(): Promise<SamplePolicyDurationOverrides> {
  const settings = await loadSamplePolicySettings();
  return {
    bronzeMaxRecordingSeconds: settings.bronzeMaxRecordingSeconds,
    silverMaxRecordingSeconds: settings.silverMaxRecordingSeconds,
    goldMaxRecordingSeconds: settings.goldMaxRecordingSeconds,
  };
}

export async function loadSamplePolicySettings(): Promise<SamplePolicySettingsRow> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("sample_policy_settings")
    .select(
      "bronze_max_recording_seconds, silver_max_recording_seconds, gold_max_recording_seconds, updated_at, updated_by",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    // Table may not exist yet in local without migration — fail soft to defaults.
    console.error("[sample-policy-settings] load failed:", error.message);
    return { ...DEFAULTS };
  }
  if (!data) {
    return { ...DEFAULTS };
  }
  return mapRow(
    data as {
      bronze_max_recording_seconds: number;
      silver_max_recording_seconds: number;
      gold_max_recording_seconds: number;
      updated_at: string | null;
      updated_by: string | null;
    },
  );
}

export type UpdateSamplePolicySettingsInput = {
  bronzeMaxRecordingSeconds: number;
  silverMaxRecordingSeconds: number;
  goldMaxRecordingSeconds: number;
};

/**
 * ADMIN-only mutation. Re-validates all values server-side.
 * Writes admin_audit_events SAMPLE_POLICY_UPDATE.
 */
export async function updateSamplePolicySettings(
  input: UpdateSamplePolicySettingsInput,
): Promise<SamplePolicySettingsRow> {
  const context = await requireRole(["ADMIN"]);

  for (const [label, value] of [
    ["Bronze", input.bronzeMaxRecordingSeconds],
    ["Silver", input.silverMaxRecordingSeconds],
    ["Gold", input.goldMaxRecordingSeconds],
  ] as const) {
    const err = validateAdminRecordingDurationSeconds(value);
    if (err) {
      throw new AuthError("FORBIDDEN", `${label}: ${err}`);
    }
  }

  const admin = createSupabaseAdminClient();
  const before = await loadSamplePolicySettings();

  const { data, error } = await admin
    .from("sample_policy_settings")
    .upsert(
      {
        id: 1,
        bronze_max_recording_seconds: input.bronzeMaxRecordingSeconds,
        silver_max_recording_seconds: input.silverMaxRecordingSeconds,
        gold_max_recording_seconds: input.goldMaxRecordingSeconds,
        updated_at: new Date().toISOString(),
        updated_by: context.profile.id,
      },
      { onConflict: "id" },
    )
    .select(
      "bronze_max_recording_seconds, silver_max_recording_seconds, gold_max_recording_seconds, updated_at, updated_by",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update sample policy settings.");
  }

  const after = mapRow(
    data as {
      bronze_max_recording_seconds: number;
      silver_max_recording_seconds: number;
      gold_max_recording_seconds: number;
      updated_at: string | null;
      updated_by: string | null;
    },
  );

  const { error: auditError } = await admin.from("admin_audit_events").insert({
    actor_user_id: context.profile.id,
    target_user_id: null,
    actor_user_number: context.profile.userNumber ?? null,
    target_user_number: null,
    action: "SAMPLE_POLICY_UPDATE",
    old_value: {
      bronzeMaxRecordingSeconds: before.bronzeMaxRecordingSeconds,
      silverMaxRecordingSeconds: before.silverMaxRecordingSeconds,
      goldMaxRecordingSeconds: before.goldMaxRecordingSeconds,
    },
    new_value: {
      bronzeMaxRecordingSeconds: after.bronzeMaxRecordingSeconds,
      silverMaxRecordingSeconds: after.silverMaxRecordingSeconds,
      goldMaxRecordingSeconds: after.goldMaxRecordingSeconds,
    },
    metadata: {
      globalMaxRecordingSeconds: RECORDING_GLOBAL_MAX_SECONDS,
    },
  });

  if (auditError) {
    // Settings already written — surface audit failure without rolling back
    // (no transaction wrapper). Log loudly for ops.
    console.error(
      "[sample-policy-settings] audit insert failed:",
      auditError.message,
    );
  }

  return after;
}

export { RECORDING_GLOBAL_MAX_SECONDS };
