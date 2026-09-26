import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canRequestBeatAudioAccess } from "@/lib/beats/audio-validation";

describe("authorization / beat-state regression for downloads", () => {
  it("non-PUBLISHED USER/ANON DOWNLOAD denied", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "USER",
        beatStatus: "DRAFT",
        purpose: "DOWNLOAD",
      }),
    ).toBe(false);
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "ARCHIVED",
        purpose: "DOWNLOAD",
      }),
    ).toBe(false);
  });

  it("server derives user_id from session — slots module has no client payload setters", () => {
    const slots = readFileSync(
      join(process.cwd(), "src/lib/downloads/slots.ts"),
      "utf8",
    );
    const button = readFileSync(
      join(process.cwd(), "src/components/beats/download-button.tsx"),
      "utf8",
    );
    expect(button).not.toMatch(/userId\s*:/);
    expect(button).not.toMatch(/anonymousTokenHash/);
    expect(button).toContain("requestBeatAudioAccessAction");
    expect(slots).toContain("createSupabaseAdminClient");
    expect(slots).toContain("reserve_beat_download_slot");
  });

  it("history page is authenticated-only requireUser path", () => {
    const history = readFileSync(
      join(process.cwd(), "src/lib/downloads/history.ts"),
      "utf8",
    );
    expect(history).toContain("requireUser");
    expect(history).toContain("createSupabaseServerClient");
    expect(history).not.toContain("createSupabaseAdminClient");
  });
});
