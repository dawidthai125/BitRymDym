import { describe, expect, it } from "vitest";

import {
  diffBeatMetadataForAudit,
  parseUploadDateInput,
  warsawDateInputValue,
} from "@/lib/beats/admin-beat-edit";
import type { Beat } from "@/types/domain";

const NOW = new Date("2026-10-29T21:00:00.000Z");
const CURRENT = "2026-10-20T08:30:00.000Z";

describe("upload date validation", () => {
  it("empty or unchanged leaves created_at alone", () => {
    expect(parseUploadDateInput("", CURRENT, NOW)).toEqual({ ok: true, iso: null });
    expect(parseUploadDateInput(null, CURRENT, NOW)).toEqual({ ok: true, iso: null });
    expect(parseUploadDateInput("2026-10-20", CURRENT, NOW)).toEqual({ ok: true, iso: null });
  });

  it("stores a changed day at 12:00 UTC (same day in Warsaw)", () => {
    const r = parseUploadDateInput("2026-03-29", CURRENT, NOW);
    expect(r).toEqual({ ok: true, iso: "2026-03-29T12:00:00.000Z" });
    expect(warsawDateInputValue("2026-03-29T12:00:00.000Z")).toBe("2026-03-29");
  });

  it.each(["29.10.2026", "2026-13-01", "2026-02-30", "2019-12-31", "2026-10-31", "2026-10-29T10:00"])(
    "rejects %j",
    (raw) => {
      expect(parseUploadDateInput(raw, CURRENT, NOW).ok).toBe(false);
    },
  );

  it("allows today in Warsaw even when UTC is still yesterday", () => {
    const lateEvening = new Date("2026-10-29T23:30:00.000Z"); // 30 Oct 00:30 Warsaw
    expect(parseUploadDateInput("2026-10-30", CURRENT, lateEvening).ok).toBe(true);
  });
});

describe("audit diff", () => {
  const base: Beat = {
    id: "b1",
    ownerId: null,
    ownershipType: "PLATFORM",
    title: "Noc",
    producer: null,
    description: null,
    genre: null,
    style: null,
    bpm: 90,
    key: "A",
    scale: "minor",
    durationSeconds: 120,
    tags: ["boom bap"],
    coverRef: null,
    status: "PUBLISHED",
    rejectionReason: null,
    lastSubmittedAt: null,
    createdAt: CURRENT,
    updatedAt: CURRENT,
  } as Beat;

  it("records only changed fields", () => {
    const after = { ...base, title: "Noc 2", producer: "Dawid", createdAt: "2026-10-01T12:00:00.000Z", updatedAt: "x" };
    const d = diffBeatMetadataForAudit(base, after);
    expect(d.changed).toEqual(["title", "producer", "createdAt"]);
    expect(d.oldValue).toEqual({ title: "Noc", producer: null, createdAt: CURRENT });
    expect(d.newValue).toMatchObject({ title: "Noc 2", producer: "Dawid" });
  });

  it("treats equal timestamps in different formats as unchanged", () => {
    const after = { ...base, createdAt: "2026-10-20T08:30:00+00:00" };
    expect(diffBeatMetadataForAudit(base, after).changed).toEqual([]);
  });
});
