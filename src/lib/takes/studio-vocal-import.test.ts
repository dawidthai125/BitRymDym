import { describe, expect, it } from "vitest";

import { TAKE_AUDIO_MAX_BYTES } from "@/config/recording";
import {
  STUDIO_VOCAL_IMPORT_ACCEPT,
  gateStudioVocalImportFile,
  resolveStudioVocalImportContentType,
} from "@/lib/takes/studio-vocal-import";

describe("studio vocal import client gate", () => {
  it("exposes accept list covering mp3/wav", () => {
    expect(STUDIO_VOCAL_IMPORT_ACCEPT).toMatch(/audio\/mpeg/);
    expect(STUDIO_VOCAL_IMPORT_ACCEPT).toMatch(/\.mp3/);
  });

  it("resolves mp3 from type and from extension when type empty", () => {
    expect(
      resolveStudioVocalImportContentType({
        name: "v.mp3",
        type: "audio/mpeg",
      }),
    ).toBe("audio/mpeg");
    expect(
      resolveStudioVocalImportContentType({
        name: "vocal.MP3",
        type: "",
      }),
    ).toBe("audio/mpeg");
    expect(
      resolveStudioVocalImportContentType({
        name: "vocal.mp3",
        type: "application/octet-stream",
      }),
    ).toBe("audio/mpeg");
  });

  it("rejects unknown extensions", () => {
    expect(
      resolveStudioVocalImportContentType({
        name: "x.flac",
        type: "audio/flac",
      }),
    ).toBeNull();
  });

  it("gates size against TAKE_AUDIO_MAX_BYTES", () => {
    const ok = gateStudioVocalImportFile({
      name: "v.mp3",
      type: "audio/mpeg",
      size: 1024,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.contentType).toBe("audio/mpeg");

    const tooBig = gateStudioVocalImportFile({
      name: "v.mp3",
      type: "audio/mpeg",
      size: TAKE_AUDIO_MAX_BYTES + 1,
    });
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.message).toMatch(/za duży/i);
  });

  it("gates unsupported mime with polish message", () => {
    const bad = gateStudioVocalImportFile({
      name: "x.ogg",
      type: "audio/ogg",
      size: 100,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/Nieobsługiwany format/i);
  });
});
