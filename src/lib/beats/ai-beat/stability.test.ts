import { describe, expect, it } from "vitest";

import {
  isStableAudioGenerationId,
  parseStabilityAudio,
  parseStabilityStart,
  sniffAudioKind,
} from "@/lib/beats/ai-beat/stability";

const ID = "a".repeat(64);

describe("Stable Audio responses", () => {
  it("accepts only a 64-character generation id", () => {
    expect(isStableAudioGenerationId(ID)).toBe(true);
    expect(isStableAudioGenerationId(`${ID}b`)).toBe(false);
    expect(parseStabilityStart(202, { id: ID })).toEqual({ ok: true, id: ID });
  });

  it("turns credit and filter failures into a short message", () => {
    expect(parseStabilityStart(402, { name: "payment_required" }).ok).toBe(false);
    const filtered = parseStabilityStart(403, { name: "content_moderation" });
    expect(filtered.ok).toBe(false);
    if (!filtered.ok) expect(filtered.message).toContain("filtr");
  });

  it("keeps a pending result pending and accepts a wav body", () => {
    expect(parseStabilityAudio(202, null, new Uint8Array())).toEqual({ status: "pending" });
    const bytes = new Uint8Array(1200);
    bytes.set([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]);
    expect(sniffAudioKind(bytes)).toBe("audio/wav");
    const ready = parseStabilityAudio(200, "audio/wav", bytes);
    expect(ready.status).toBe("ready");
  });

  it("rejects a tiny file", () => {
    const ready = parseStabilityAudio(200, "audio/wav", new Uint8Array(20));
    expect(ready.status).toBe("error");
  });
});
