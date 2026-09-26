import { describe, expect, it } from "vitest";

import {
  filterPublicCatalog,
  formatDurationSeconds,
  isPubliclyVisibleBeatStatus,
  PUBLIC_PLAYBACK_PURPOSE,
  PUBLIC_UI_FORBIDDEN_PURPOSES,
  toPublicBeatDetail,
  toPublicCatalogItem,
  toSafeDownloadErrorMessage,
  toSafePlaybackErrorMessage,
} from "@/lib/beats/public";
import type { Beat } from "@/types/domain";

function makeBeat(overrides: Partial<Beat> = {}): Beat {
  return {
    id: "beat-1",
    ownerId: null,
    ownershipType: "PLATFORM",
    title: "Night Run",
    producer: "BRD",
    description: "Desc",
    genre: "Trap",
    style: "Dark",
    bpm: 140,
    key: "A",
    scale: "minor",
    durationSeconds: 125,
    tags: [],
    coverRef: "cover://a",
    status: "PUBLISHED",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Phase 1.6 public beats surface", () => {
  it("marks only PUBLISHED as publicly visible", () => {
    expect(isPubliclyVisibleBeatStatus("PUBLISHED")).toBe(true);
    expect(isPubliclyVisibleBeatStatus("DRAFT")).toBe(false);
    expect(isPubliclyVisibleBeatStatus("ARCHIVED")).toBe(false);
    expect(isPubliclyVisibleBeatStatus("PENDING_REVIEW")).toBe(false);
  });

  it("filters catalog to PUBLISHED only", () => {
    const catalog = filterPublicCatalog([
      makeBeat({ id: "1", status: "PUBLISHED" }),
      makeBeat({ id: "2", status: "DRAFT" }),
      makeBeat({ id: "3", status: "ARCHIVED" }),
    ]);
    expect(catalog.map((b) => b.id)).toEqual(["1"]);
  });

  it("projects catalog and detail fields without status leakage", () => {
    const beat = makeBeat();
    expect(toPublicCatalogItem(beat)).toEqual({
      id: "beat-1",
      title: "Night Run",
      producer: "BRD",
      genre: "Trap",
      style: "Dark",
      bpm: 140,
      key: "A",
      scale: "minor",
      durationSeconds: 125,
      coverRef: "cover://a",
    });
    expect(toPublicBeatDetail(beat).description).toBe("Desc");
    expect(toPublicCatalogItem(beat)).not.toHaveProperty("status");
  });

  it("formats duration", () => {
    expect(formatDurationSeconds(125)).toBe("2:05");
    expect(formatDurationSeconds(0)).toBe("0:00");
  });

  it("locks public playback purpose to PLAYBACK; DOWNLOAD reserved for dedicated CTA", () => {
    expect(PUBLIC_PLAYBACK_PURPOSE).toBe("PLAYBACK");
    expect(PUBLIC_UI_FORBIDDEN_PURPOSES).toContain("DOWNLOAD");
    expect(PUBLIC_UI_FORBIDDEN_PURPOSES).not.toContain("PLAYBACK");
  });

  it("maps unsafe playback errors to safe messages", () => {
    expect(toSafePlaybackErrorMessage("relation beat_audio_assets does not exist")).toBe(
      "Nie udało się odtworzyć audio.",
    );
    expect(toSafePlaybackErrorMessage("Audio access denied.")).toBe(
      "Brak dostępu do odsłuchu.",
    );
    expect(toSafePlaybackErrorMessage("No READY audio asset for this beat.")).toBe(
      "Audio niedostępne dla tego bitu.",
    );
    expect(toSafePlaybackErrorMessage("Failed to create signed URL.")).toBe(
      "Sesja odtwarzania wygasła. Spróbuj ponownie.",
    );
  });

  it("maps download limit and access errors safely", () => {
    expect(toSafeDownloadErrorMessage("Daily download limit reached.")).toBe(
      "Osiągnięto dzienny limit pobrań. Spróbuj ponownie jutro.",
    );
    expect(toSafeDownloadErrorMessage("Audio access denied.")).toBe(
      "Brak dostępu do pobrania.",
    );
    expect(toSafeDownloadErrorMessage("No READY audio asset for this beat.")).toBe(
      "Audio niedostępne dla tego bitu.",
    );
  });
});
