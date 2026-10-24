import { describe, expect, it } from "vitest";

import { qcBasicMp3Bytes, qcHqMp3Bytes } from "@/lib/audio/mp3-encode";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";

describe("MP3 QC rejects non-MPEG bytes without spawning ffmpeg", () => {
  it("rejects fake placeholder bytes in basic QC", async () => {
    const fake = Buffer.from("e3.5-fake-placeholder:job:BASIC_MP3\n", "utf8");
    await expect(qcBasicMp3Bytes(fake)).rejects.toBeInstanceOf(
      RenderJobDomainError,
    );
  });

  it("rejects empty / garbage as non-MPEG", async () => {
    await expect(qcBasicMp3Bytes(Buffer.alloc(0))).rejects.toThrow(/empty/);
    await expect(qcBasicMp3Bytes(Buffer.from([1, 2, 3, 4]))).rejects.toThrow(
      /MPEG|fake/i,
    );
  });

  it("rejects fake placeholder in HQ QC", async () => {
    const fake = Buffer.from("e3.5-fake-placeholder:job:HQ_MP3\n", "utf8");
    await expect(qcHqMp3Bytes(fake)).rejects.toBeInstanceOf(
      RenderJobDomainError,
    );
  });
});
