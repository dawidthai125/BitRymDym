/**
 * User beats 2026-10-30 — owner edit after publish (pure rules).
 * Owner decision: title/metadata/settings edits save immediately, no
 * re-moderation. Covers are handled separately (always filtered).
 */
import type { BeatStatus, BeatVisibility } from "@/types/domain";
import { BEAT_VISIBILITIES } from "@/types/domain";

export const OWNER_EDITABLE_STATUSES = [
  "DRAFT",
  "REJECTED",
  "APPROVED",
  "PUBLISHED",
] as const satisfies readonly BeatStatus[];

/** Statuses where an owner edit is audited (already seen by moderation). */
export const OWNER_EDIT_AUDITED_STATUSES = [
  "APPROVED",
  "PUBLISHED",
] as const satisfies readonly BeatStatus[];

export type OwnerBeatSettings = {
  visibility?: BeatVisibility;
  allowDownload?: boolean;
  allowStudioUse?: boolean;
};

export function isOwnerEditableStatus(status: BeatStatus): boolean {
  return (OWNER_EDITABLE_STATUSES as readonly string[]).includes(status);
}

export function isOwnerEditAudited(status: BeatStatus): boolean {
  return (OWNER_EDIT_AUDITED_STATUSES as readonly string[]).includes(status);
}

/** Validate untrusted settings input; unknown keys are ignored. */
export function parseOwnerBeatSettings(
  input: unknown,
): { ok: true; value: OwnerBeatSettings } | { ok: false; error: string } {
  if (input == null) return { ok: true, value: {} };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Nieprawidłowe ustawienia bitu." };
  }
  const raw = input as Record<string, unknown>;
  const value: OwnerBeatSettings = {};
  if (raw.visibility !== undefined) {
    if (!(BEAT_VISIBILITIES as readonly unknown[]).includes(raw.visibility)) {
      return { ok: false, error: "Nieprawidłowa widoczność bitu." };
    }
    value.visibility = raw.visibility as BeatVisibility;
  }
  for (const key of ["allowDownload", "allowStudioUse"] as const) {
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== "boolean") {
        return { ok: false, error: "Nieprawidłowe ustawienia bitu." };
      }
      value[key] = raw[key] as boolean;
    }
  }
  return { ok: true, value };
}

export function toOwnerSettingsPayload(settings: OwnerBeatSettings) {
  return {
    ...(settings.visibility !== undefined
      ? { visibility: settings.visibility }
      : {}),
    ...(settings.allowDownload !== undefined
      ? { allow_download: settings.allowDownload }
      : {}),
    ...(settings.allowStudioUse !== undefined
      ? { allow_studio_use: settings.allowStudioUse }
      : {}),
  };
}
