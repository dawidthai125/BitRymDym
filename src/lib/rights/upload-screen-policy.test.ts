import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import pl from "../../../messages/pl.json";
import {
  blockCodeForMatch,
  contentMatchesDeclaredType,
  decideUploadScreen,
  isBlockedAudioMatch,
  isCatalogBeatUpload,
  isCurrentRightsStatement,
  parseTakeUploadSource,
  sniffAudioContainer,
  UPLOAD_RIGHTS_STATEMENT_VERSION,
} from "./upload-screen-policy";

const bytes = (...parts: Array<string | number[]>) => {
  const out: number[] = [];
  for (const p of parts) out.push(...(typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p));
  while (out.length < 16) out.push(0);
  return new Uint8Array(out);
};

describe("rights statement on the server", () => {
  it("the version pins the exact statement texts (change a text → bump UPLOAD_RIGHTS_STATEMENT_VERSION)", () => {
    const hash = (m: typeof pl) =>
      createHash("sha256").update([m.studio.studioRecordingPanel.importPrawa, m.studio.stemImport.prawa, m.mastering.prawa].join("\n")).digest("hex");
    expect(UPLOAD_RIGHTS_STATEMENT_VERSION).toBe("2026-11-26");
    expect(hash(pl)).toBe("24701a9a8735d4e36ff930fb4dba1fba3f5253687d1b9d055a76047be5ea3244");
    expect(hash(en as unknown as typeof pl)).toBe("605d2d5498c70cd521bbf6e839bbd93a438befabc457b0b31eecca999f13f322");
  });

  it("only the current version is accepted", () => {
    expect(isCurrentRightsStatement(UPLOAD_RIGHTS_STATEMENT_VERSION)).toBe(true);
    for (const v of [undefined, null, "", "2026-11-25", true, 1, "2026-11-26 "]) expect(isCurrentRightsStatement(v)).toBe(false);
  });

  it("an import is recognised also from old clients; mic and recorder do not need the statement", () => {
    expect(parseTakeUploadSource("import", undefined)).toBe("import");
    expect(parseTakeUploadSource(undefined, true)).toBe("import");
    expect(parseTakeUploadSource("mic", true)).toBe("mic");
    expect(parseTakeUploadSource("recorder", undefined)).toBe("recorder");
    expect(parseTakeUploadSource("anything", undefined)).toBe("mic");
  });
});

describe("file type from the content", () => {
  it("sniffs the containers the upload accepts", () => {
    expect(sniffAudioContainer(bytes([0x1a, 0x45, 0xdf, 0xa3]))).toBe("webm");
    expect(sniffAudioContainer(bytes("OggS"))).toBe("ogg");
    expect(sniffAudioContainer(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBe("wav");
    expect(sniffAudioContainer(bytes("fLaC"))).toBe("flac");
    expect(sniffAudioContainer(bytes([0, 0, 0, 0x20], "ftypM4A "))).toBe("mp4");
    expect(sniffAudioContainer(bytes("ID3"))).toBe("mp3");
    expect(sniffAudioContainer(bytes([0xff, 0xfb, 0x90, 0x00]))).toBe("mp3");
    expect(sniffAudioContainer(bytes([0xff, 0xf1, 0x50, 0x80]))).toBe("aac");
    expect(sniffAudioContainer(bytes("FORM", [0, 0, 0, 0], "AIFF"))).toBe("aiff");
    // FLAC with an ID3v2 tag in front (tag size 4, syncsafe) stays FLAC; a tagged MP3 stays MP3.
    expect(sniffAudioContainer(bytes("ID3", [4, 0, 0, 0, 0, 0, 4], "abcd", "fLaC", [0, 0, 0, 0, 0, 0, 0, 0]))).toBe("flac");
    expect(sniffAudioContainer(bytes("ID3", [4, 0, 0, 0, 0, 0, 4], "abcd", [0xff, 0xfb, 0x90, 0x00], [0, 0, 0, 0, 0, 0, 0, 0]))).toBe("mp3");
  });

  it("refuses non-audio and a renamed file (declared type ≠ content)", () => {
    expect(contentMatchesDeclaredType(bytes("%PDF-1.7"), "audio/mpeg")).toBe(false);
    expect(contentMatchesDeclaredType(bytes([0x4d, 0x5a, 0x90, 0x00]), "audio/wav")).toBe(false); // .exe
    expect(contentMatchesDeclaredType(bytes("<html>"), "audio/webm")).toBe(false);
    expect(contentMatchesDeclaredType(bytes("RIFF", [0, 0, 0, 0], "WAVE"), "audio/mpeg")).toBe(false);
    expect(contentMatchesDeclaredType(new Uint8Array(4), "audio/wav")).toBe(false);
  });

  it("accepts the right content with codec parameters", () => {
    expect(contentMatchesDeclaredType(bytes([0x1a, 0x45, 0xdf, 0xa3]), "audio/webm;codecs=opus")).toBe(true);
    expect(contentMatchesDeclaredType(bytes("OggS"), "audio/ogg; codecs=opus")).toBe(true);
    expect(contentMatchesDeclaredType(bytes("RIFF", [0, 0, 0, 0], "WAVE"), "audio/x-wav")).toBe(true);
    expect(contentMatchesDeclaredType(bytes([0, 0, 0, 0x20], "ftypisom"), "audio/mp4")).toBe(true);
    expect(contentMatchesDeclaredType(bytes([0xff, 0xf1, 0x50, 0x80]), "audio/aac")).toBe(true);
  });
});

describe("acoustic thresholds", () => {
  it("blocks a re-encode / volume change / cut of a taken-down song (strict rule)", () => {
    expect(isBlockedAudioMatch({ score: 0.97, matchedSeconds: 170 }, 175, 180)).toBe(true);
    expect(isBlockedAudioMatch({ score: 0.9, matchedSeconds: 52 }, 55, 60)).toBe(true);
  });

  it("blocks a mastered or buried copy (long rule), not a short shared loop", () => {
    expect(isBlockedAudioMatch({ score: 0.6, matchedSeconds: 90 }, 150, 150)).toBe(true);
    expect(isBlockedAudioMatch({ score: 0.6, matchedSeconds: 25 }, 150, 150)).toBe(false);
    expect(isBlockedAudioMatch({ score: 0.45, matchedSeconds: 120 }, 150, 150)).toBe(false);
  });

  it("a short blocked one-shot needs 80 % of the shorter file at the strict score", () => {
    expect(isBlockedAudioMatch({ score: 0.9, matchedSeconds: 9 }, 120, 10)).toBe(true);
    expect(isBlockedAudioMatch({ score: 0.9, matchedSeconds: 5 }, 120, 10)).toBe(false);
  });

  it("catalogue beats use the strict rule only", () => {
    expect(isCatalogBeatUpload({ score: 0.9, matchedSeconds: 40 }, 60)).toBe(true);
    expect(isCatalogBeatUpload({ score: 0.6, matchedSeconds: 120 }, 150)).toBe(false);
  });

  it("decision: a blocked match wins, then a catalogue beat, else passed", () => {
    const blocked = [{ id: "b1", durationSeconds: 60, score: 0.95, matchedSeconds: 50 }];
    const catalog = [{ beatId: "x", score: 0.95, matchedSeconds: 50 }];
    expect(decideUploadScreen({ uploadSeconds: 60, blocked, catalog })).toMatchObject({ outcome: "blocked", matchKind: "blocked_fingerprint", blockedId: "b1" });
    expect(decideUploadScreen({ uploadSeconds: 60, blocked: [], catalog })).toMatchObject({ outcome: "blocked", matchKind: "catalog_fingerprint", catalogBeatId: "x" });
    expect(decideUploadScreen({ uploadSeconds: 60, blocked: [{ ...blocked[0]!, score: 0.2 }], catalog: [{ ...catalog[0]!, score: 0.4 }] })).toEqual({ outcome: "passed" });
  });

  it("maps DB match kinds to the user message", () => {
    expect(blockCodeForMatch("blocked_sha256")).toBe("BLOCKED_AUDIO");
    expect(blockCodeForMatch("blocked_fingerprint")).toBe("BLOCKED_AUDIO");
    expect(blockCodeForMatch("catalog_sha256")).toBe("CATALOG_BEAT");
  });
});
