import "server-only";

import { requireAdminGenerator } from "@/lib/beats/ai-beat/generate";
import { isUuid } from "@/lib/beats/audio-validation";
import { GENERATED_BEAT_TAG, type CatalogLane } from "@/lib/beats/catalog-lane";
import { BeatRequestError } from "@/lib/beats/request-error";
import { transitionBeatStatus } from "@/lib/beats/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const NOT_WAITING = "Tego bitu nie ma w katalogu oczekujących.";
const NEED_COVER = "Najpierw okładka. Bez niej bit nie wchodzi do katalogu.";
const NEED_COLUMN =
  "Katalog wymaga kolumny catalog_lane w bazie. Migracja nie jest jeszcze wdrożona.";

type WaitingRow = {
  id: string;
  ownership_type: string;
  status: string;
  tags: string[] | null;
  cover_status: string | null;
};

function isWaitingDraft(row: WaitingRow | null): row is WaitingRow {
  return Boolean(
    row &&
      row.ownership_type === "PLATFORM" &&
      row.status === "DRAFT" &&
      Array.isArray(row.tags) &&
      row.tags.includes(GENERATED_BEAT_TAG),
  );
}

function isMissingCatalogLaneColumn(error: {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}): boolean {
  const blob = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  if (!blob.includes("catalog_lane")) return false;
  const code = error.code ?? "";
  return (
    code === "42703" ||
    code === "PGRST204" ||
    blob.includes("column") ||
    blob.includes("schema cache")
  );
}

/**
 * Sets the lane, then publishes. The lane is written first so a crash
 * cannot leave a paid beat published as free. Checkout is not built here.
 */
export async function releaseWaitingBeat(beatId: string, lane: CatalogLane): Promise<void> {
  await requireAdminGenerator();
  if (lane !== "free" && lane !== "paid") {
    throw new BeatRequestError("Wybierz katalog: darmowy albo płatny.");
  }
  if (!isUuid(beatId)) throw new BeatRequestError(NOT_WAITING);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beats")
    .select("id, ownership_type, status, tags, cover_status")
    .eq("id", beatId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = (data as WaitingRow | null) ?? null;
  if (!isWaitingDraft(row)) throw new BeatRequestError(NOT_WAITING);
  if (row.cover_status !== "approved") throw new BeatRequestError(NEED_COVER);

  const updated = await admin
    .from("beats")
    .update({ catalog_lane: lane })
    .eq("id", beatId)
    .eq("status", "DRAFT")
    .eq("ownership_type", "PLATFORM")
    .select("id");
  if (updated.error) {
    if (isMissingCatalogLaneColumn(updated.error)) {
      throw new BeatRequestError(NEED_COLUMN);
    }
    throw new Error(updated.error.message);
  }
  if (!updated.data || updated.data.length === 0) {
    throw new BeatRequestError(
      "Ten bit zmienił się w trakcie publikacji. Odśwież listę.",
      "CONFLICT",
    );
  }

  await transitionBeatStatus(beatId, "PUBLISHED", { licenseAcknowledged: true });
}
