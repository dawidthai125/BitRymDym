import { describe, expect, it } from "vitest";

import {
  isOwnerEditAudited,
  isOwnerEditableStatus,
  parseOwnerBeatSettings,
  toOwnerSettingsPayload,
} from "@/lib/beats/owner-edit-policy";

describe("owner edit policy", () => {
  it("owner can edit after publish (no re-moderation), not while pending or archived", () => {
    expect(isOwnerEditableStatus("PUBLISHED")).toBe(true);
    expect(isOwnerEditableStatus("APPROVED")).toBe(true);
    expect(isOwnerEditableStatus("DRAFT")).toBe(true);
    expect(isOwnerEditableStatus("REJECTED")).toBe(true);
    expect(isOwnerEditableStatus("PENDING_REVIEW")).toBe(false);
    expect(isOwnerEditableStatus("ARCHIVED")).toBe(false);
    expect(isOwnerEditAudited("PUBLISHED")).toBe(true);
    expect(isOwnerEditAudited("DRAFT")).toBe(false);
  });

  it("parses settings strictly and maps to columns", () => {
    const ok = parseOwnerBeatSettings({
      visibility: "private",
      allowDownload: false,
      allowStudioUse: true,
      status: "PUBLISHED",
      cover_status: "approved",
    });
    expect(ok).toEqual({
      ok: true,
      value: { visibility: "private", allowDownload: false, allowStudioUse: true },
    });
    expect(ok.ok && toOwnerSettingsPayload(ok.value)).toEqual({
      visibility: "private",
      allow_download: false,
      allow_studio_use: true,
    });
    expect(parseOwnerBeatSettings({ visibility: "unlisted" }).ok).toBe(false);
    expect(parseOwnerBeatSettings({ allowDownload: "yes" }).ok).toBe(false);
    expect(parseOwnerBeatSettings([]).ok).toBe(false);
    expect(parseOwnerBeatSettings(undefined)).toEqual({ ok: true, value: {} });
  });
});
