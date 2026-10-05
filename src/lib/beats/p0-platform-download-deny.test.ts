import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canDownloadOriginalBeatMaster,
  canRequestBeatAudioAccess,
} from "@/lib/beats/audio-validation";
import { toSafeDownloadErrorMessage } from "@/lib/beats/public";

const ACTORS = ["ANON", "USER", "MODERATOR", "ADMIN"] as const;

describe("P0 PLATFORM original master DOWNLOAD deny", () => {
  it.each(ACTORS)(
    "PLATFORM + %s + DOWNLOAD → DENY (user-facing)",
    (actor) => {
      expect(
        canRequestBeatAudioAccess({
          actor,
          beatStatus: "PUBLISHED",
          purpose: "DOWNLOAD",
          ownershipType: "PLATFORM",
        }),
      ).toBe(false);
      expect(
        canDownloadOriginalBeatMaster({
          actor,
          beatStatus: "PUBLISHED",
          ownershipType: "PLATFORM",
        }),
      ).toBe(false);
    },
  );

  it.each(["FREE", "BRONZE", "SILVER", "GOLD"] as const)(
    "PLATFORM + %s product tier + DOWNLOAD → DENY (gate ignores tier)",
    () => {
      // Product tiers resolve to USER actor at the Access Gate; ownership wins.
      expect(
        canDownloadOriginalBeatMaster({
          actor: "USER",
          beatStatus: "PUBLISHED",
          ownershipType: "PLATFORM",
        }),
      ).toBe(false);
    },
  );

  it("PLATFORM PLAYBACK remains ALLOW for ANON/USER/ADMIN", () => {
    for (const actor of ["ANON", "USER", "ADMIN"] as const) {
      expect(
        canRequestBeatAudioAccess({
          actor,
          beatStatus: "PUBLISHED",
          purpose: "PLAYBACK",
          ownershipType: "PLATFORM",
        }),
      ).toBe(true);
    }
  });

  it("PLAYBACK does not require ownershipType (recording source)", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "PUBLISHED",
        purpose: "PLAYBACK",
      }),
    ).toBe(true);
  });

  it("USER-owned PUBLISHED DOWNLOAD still ALLOW for ANON/USER/ADMIN", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
        ownershipType: "USER",
      }),
    ).toBe(true);
    expect(
      canRequestBeatAudioAccess({
        actor: "USER",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
        ownershipType: "USER",
      }),
    ).toBe(true);
    expect(
      canRequestBeatAudioAccess({
        actor: "ADMIN",
        beatStatus: "DRAFT",
        purpose: "DOWNLOAD",
        ownershipType: "USER",
      }),
    ).toBe(true);
  });

  it("USER-owned DOWNLOAD still DENY for MODERATOR", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "MODERATOR",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
        ownershipType: "USER",
      }),
    ).toBe(false);
  });

  it("DOWNLOAD without ownershipType fails closed", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "USER",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
      }),
    ).toBe(false);
    expect(
      canRequestBeatAudioAccess({
        actor: "ADMIN",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
        ownershipType: null,
      }),
    ).toBe(false);
  });

  it("maps PLATFORM deny to stable Polish product message", () => {
    expect(
      toSafeDownloadErrorMessage(
        "Original platform beat download is not available.",
      ),
    ).toBe("Pobieranie oryginalnego bitu jest niedostępne.");
  });

  it("access gate loads ownership_type before DOWNLOAD signed URL", () => {
    const access = readFileSync(
      join(process.cwd(), "src/lib/beats/audio-access.ts"),
      "utf8",
    );
    expect(access).toContain("ownership_type");
    expect(access).toContain("canRequestBeatAudioAccess");
    expect(access).toContain("Original platform beat download is not available.");
    const downloadBranch = access.slice(
      access.indexOf("export async function requestBeatAudioAccess"),
      access.indexOf("export async function requestPlatformBeatOpsExport"),
    );
    const ownershipCheck = downloadBranch.indexOf("ownershipType");
    const signedUrl = downloadBranch.indexOf("createSignedUrl");
    expect(ownershipCheck).toBeGreaterThan(-1);
    expect(signedUrl).toBeGreaterThan(ownershipCheck);
  });

  it("OPS export is separate privileged ADMIN path (≠ DownloadButton)", () => {
    const access = readFileSync(
      join(process.cwd(), "src/lib/beats/audio-access.ts"),
      "utf8",
    );
    const actions = readFileSync(
      join(process.cwd(), "src/lib/beats/audio-actions.ts"),
      "utf8",
    );
    const button = readFileSync(
      join(process.cwd(), "src/components/beats/download-button.tsx"),
      "utf8",
    );
    const opsBtn = readFileSync(
      join(
        process.cwd(),
        "src/components/admin/admin-platform-ops-export-button.tsx",
      ),
      "utf8",
    );
    expect(access).toContain("export async function requestPlatformBeatOpsExport");
    expect(access).toContain('requireRole(["ADMIN"])');
    expect(access).toContain('ownership_type !== "PLATFORM"');
    expect(access).toContain("OPS_EXPORT");
    expect(access).toContain("download: true");
    expect(actions).toContain("requestPlatformBeatOpsExportAction");
    expect(button).not.toContain("requestPlatformBeatOpsExport");
    expect(button).toContain("requestBeatAudioAccessAction");
    expect(opsBtn).toContain("requestPlatformBeatOpsExportAction");
  });

  it("public beat detail hides DownloadButton for PLATFORM", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/beat/[id]/page.tsx"),
      "utf8",
    );
    const client = readFileSync(
      join(process.cwd(), "src/app/beat/[id]/beat-detail-client.tsx"),
      "utf8",
    );
    expect(page).toContain(
      'originalMasterDownloadAllowed={beat.ownershipType === "USER"}',
    );
    expect(client).toContain("originalMasterDownloadAllowed");
    expect(client).toContain("Pobieranie oryginalnego bitu jest niedostępne.");
  });

  it("does not invent a unified canDownload() across resources", () => {
    const validation = readFileSync(
      join(process.cwd(), "src/lib/beats/audio-validation.ts"),
      "utf8",
    );
    expect(validation).toContain("canDownloadOriginalBeatMaster");
    expect(validation).not.toMatch(
      /export function canDownload\s*\(/,
    );
  });
});
