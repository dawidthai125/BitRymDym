import "server-only";

import { requireRole } from "@/lib/auth/session";
import { BEAT_AUDIO_BUCKET } from "@/lib/beats/audio-validation";
import { removeCatalogAsset } from "@/lib/studio/samples/catalog-asset";
import {
  instrumentKind,
  isSampleInstrumentId,
  isSampleUuid,
  normalizeSampleDescription,
  normalizeSampleTitle,
  parseSampleLabMeta,
  STUDIO_SAMPLES_TABLE,
} from "@/lib/studio/samples/sample-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CatalogSampleEdit = {
  sampleId: string;
  title: unknown;
  instrument: unknown;
  sampleType: unknown;
  bpm: unknown;
  bars: unknown;
  musicalKey: unknown;
  /** Absent (null) = keep the stored text; empty = remove it. */
  description?: unknown;
  descriptionEn?: unknown;
};

export type AdminSampleResult = { ok: true; removed?: "deleted" | "unlisted" } | { ok: false; error: string };

/** ADMIN edits the catalog card of any published sample (title, instrument, type, tempo, bars, key). */
export async function adminUpdateCatalogSample(input: CatalogSampleEdit): Promise<AdminSampleResult> {
  await requireRole(["ADMIN"]);
  if (!isSampleUuid(input.sampleId)) return { ok: false, error: "Nieznany sampel." };
  const title = normalizeSampleTitle(input.title);
  if (!title) return { ok: false, error: "Tytuł musi mieć od 1 do 80 znaków." };
  if (!isSampleInstrumentId(input.instrument)) return { ok: false, error: "Wybierz instrument z listy." };
  const meta = parseSampleLabMeta({
    sampleType: input.sampleType,
    bpm: input.bpm,
    bars: input.bars,
    musicalKey: input.musicalKey,
  });
  if (!meta.ok) return { ok: false, error: `Popraw pola: ${meta.details.join(", ")}.` };
  const description = normalizeSampleDescription(input.description);
  const descriptionEn = normalizeSampleDescription(input.descriptionEn);
  if (description === false || descriptionEn === false) return { ok: false, error: "Opis może mieć do 600 znaków." };
  const { error } = await createSupabaseAdminClient()
    .from(STUDIO_SAMPLES_TABLE)
    .update({
      title,
      instrument: input.instrument,
      kind: instrumentKind(input.instrument),
      sample_type: meta.value.sampleType,
      bpm: meta.value.bpm,
      bars: meta.value.bars,
      musical_key: meta.value.musicalKey,
      ...(description === undefined ? {} : { description }),
      ...(descriptionEn === undefined ? {} : { description_en: descriptionEn }),
    })
    .eq("id", input.sampleId);
  if (error) return { ok: false, error: "Nie udało się zapisać zmian." };
  return { ok: true };
}

/**
 * ADMIN removes a sample from the catalog. A BitRymDym (admin-owned) sample is deleted with
 * its file; a user's sample is only taken off the catalog (back to private), so no one's
 * recording is destroyed. Copies already placed in projects are separate files and stay.
 */
export async function adminRemoveCatalogSample(sampleId: string): Promise<AdminSampleResult> {
  await requireRole(["ADMIN"]);
  if (!isSampleUuid(sampleId)) return { ok: false, error: "Nieznany sampel." };
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from(STUDIO_SAMPLES_TABLE)
    .select("id, owner_id, object_key, catalog_asset_id")
    .eq("id", sampleId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Nie ma takiego sampla." };
  const { data: owner } = await admin.from("profiles").select("role").eq("id", row.owner_id).maybeSingle();
  if (owner?.role === "ADMIN") {
    const { error } = await admin.from(STUDIO_SAMPLES_TABLE).delete().eq("id", sampleId);
    if (error) return { ok: false, error: "Nie udało się usunąć sampla." };
    if (row.object_key) await admin.storage.from(BEAT_AUDIO_BUCKET).remove([String(row.object_key)]);
    await removeCatalogAsset(admin, row.catalog_asset_id);
    return { ok: true, removed: "deleted" };
  }
  const { error } = await admin
    .from(STUDIO_SAMPLES_TABLE)
    // Only a PUBLISHED sample may carry a catalog asset (studio_samples_published_catalog_chk).
    .update({ status: "PRIVATE", public_listing: false, catalog_asset_id: null })
    .eq("id", sampleId);
  if (error) return { ok: false, error: "Nie udało się zdjąć sampla z katalogu." };
  await removeCatalogAsset(admin, row.catalog_asset_id);
  return { ok: true, removed: "unlisted" };
}
