import "server-only";

import { minimumTierFor, vocalPresetAccessForTier } from "@/config/plan-policy";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PremiumTier } from "@/types/premium";

import {
  parseFxPresetName,
  parseFxPresetPayload,
  type FxPresetKind,
  type FxPresetPayload,
  type OwnFxPreset,
} from "./vocal-presets";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Plan gate error (403) — names the lowest plan that unlocks the feature. */
export class StudioPlanFeatureError extends Error {
  readonly code = "PLAN_FEATURE_LOCKED" as const;
  constructor(
    readonly feature: "fx_presets_save" | "fx_presets_sets" | "fx_presets_limit",
    readonly tier: PremiumTier,
    readonly requiredTier: PremiumTier,
    message: string,
  ) {
    super(message);
    this.name = "StudioPlanFeatureError";
  }
}

export function isFxPresetStoreMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const m = error.message ?? "";
  return m.includes("studio_fx_presets") && /exist|schema cache/i.test(m);
}

function mapRow(r: Record<string, unknown>): OwnFxPreset | null {
  try {
    const { kind, payload } = parseFxPresetPayload(r.kind, r.payload);
    return { id: String(r.id), name: String(r.name), kind, payload, createdAt: String(r.created_at) };
  } catch {
    return null; // unreadable rows are hidden, never applied
  }
}

export type FxPresetAccess = { tier: PremiumTier; maxOwn: number; roleSets: boolean };

export async function fxPresetAccessFor(context: AuthContext): Promise<FxPresetAccess> {
  const tier = (await resolveProductEntitlementForAuthContext(context)).premiumTier;
  const access = vocalPresetAccessForTier(tier);
  return { tier, maxOwn: access.maxOwn, roleSets: access.roleSets };
}

export async function listFxPresets(context: AuthContext): Promise<{
  available: boolean;
  access: FxPresetAccess;
  presets: OwnFxPreset[];
}> {
  const access = await fxPresetAccessFor(context);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_fx_presets")
    .select("id, name, kind, payload, created_at")
    .eq("owner_id", context.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isFxPresetStoreMissing(error)) return { available: false, access, presets: [] };
    throw new Error(error.message);
  }
  const presets = (data ?? []).map((r) => mapRow(r as Record<string, unknown>)).filter((p): p is OwnFxPreset => p !== null);
  return { available: true, access, presets };
}

/** Save an own preset — Silver+ (chains), Gold (role sets), capped per plan. */
export async function createFxPreset(
  context: AuthContext,
  input: { name: unknown; kind: unknown; payload: unknown },
): Promise<OwnFxPreset> {
  const access = await fxPresetAccessFor(context);
  const name = parseFxPresetName(input.name);
  const { kind, payload } = parseFxPresetPayload(input.kind, input.payload);
  if (access.maxOwn <= 0) {
    throw new StudioPlanFeatureError(
      "fx_presets_save",
      access.tier,
      minimumTierFor((p) => p.tools.vocalPresets.maxOwn > 0),
      "Własne presety brzmienia są dostępne od planu Silver.",
    );
  }
  if (kind === "set" && !access.roleSets) {
    throw new StudioPlanFeatureError(
      "fx_presets_sets",
      access.tier,
      minimumTierFor((p) => p.tools.vocalPresets.roleSets),
      "Zestawy dla wokalu, dubli i adlibów są dostępne w planie Gold.",
    );
  }
  const admin = createSupabaseAdminClient();
  const { count, error: countError } = await admin
    .from("studio_fx_presets")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", context.userId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= access.maxOwn) {
    throw new StudioPlanFeatureError(
      "fx_presets_limit",
      access.tier,
      access.tier,
      `Masz już ${access.maxOwn} presetów — usuń któryś, żeby zapisać nowy.`,
    );
  }
  const { data, error } = await admin
    .from("studio_fx_presets")
    .insert({ owner_id: context.userId, name, kind, payload })
    .select("id, name, kind, payload, created_at")
    .single();
  if (error) throw new Error(error.message);
  const preset = mapRow(data as Record<string, unknown>);
  if (!preset) throw new Error("Nie udało się zapisać presetu.");
  return preset;
}

export async function deleteFxPreset(context: AuthContext, presetId: string): Promise<void> {
  if (!UUID.test(presetId)) throw new AuthError("NOT_FOUND", "Preset nie został znaleziony.");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_fx_presets")
    .delete()
    .eq("id", presetId)
    .eq("owner_id", context.userId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new AuthError("NOT_FOUND", "Preset nie został znaleziony.");
}

export type { FxPresetKind, FxPresetPayload };
