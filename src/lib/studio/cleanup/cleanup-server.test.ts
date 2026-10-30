import { describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import pl from "../../../../messages/pl.json";

const rows: { take_id: string; result_object_key: string | null }[] = [];
let tableError: { code: string } | null = null;
const calls: string[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    const q = {
      select: () => q, eq: (c: string, v: unknown) => (calls.push(`${c}=${String(v)}`), q),
      in: () => Promise.resolve({ data: tableError ? null : rows, error: tableError }),
    };
    return { from: () => q };
  },
}));

import { applyStudioCleanupOverrides, warsawDayStartIso } from "./cleanup-server";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const ref = (id: string) => ({ kind: "take" as const, id, storageBucket: "take-audio", objectKey: `o/${id}.webm`, contentType: "audio/webm", durationSeconds: 10, byteSize: 5 });

function keys(o: unknown, p = ""): string[] {
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();
}

describe("cleanup server", () => {
  it("Warsaw day start (CET winter / CEST summer)", () => {
    expect(warsawDayStartIso(new Date("2026-10-30T05:17:00Z"))).toBe("2026-10-29T23:00:00.000Z");
    expect(warsawDayStartIso(new Date("2026-07-01T21:30:00Z"))).toBe("2026-06-30T22:00:00.000Z");
    expect(warsawDayStartIso(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-01T22:00:00.000Z");
  });

  it("render override swaps only applied takes of the owner to the cleaned FLAC", async () => {
    rows.splice(0, rows.length, { take_id: T1, result_object_key: `studio-cleanup/o/${T1}/j.flac` });
    const takes = { [T1]: ref(T1), [T2]: ref(T2) };
    await applyStudioCleanupOverrides(takes, "owner-1");
    expect(takes[T1]).toMatchObject({ storageBucket: "audio-artifacts", objectKey: `studio-cleanup/o/${T1}/j.flac`, contentType: "audio/flac" });
    expect(takes[T2]).toEqual(ref(T2));
    expect(calls).toEqual(expect.arrayContaining(["owner_id=owner-1", "status=succeeded", "applied=true"]));
  });

  it("missing table → no-op (feature not deployed)", async () => {
    tableError = { code: "42P01" };
    const takes = { [T1]: ref(T1) };
    await applyStudioCleanupOverrides(takes, "owner-1");
    expect(takes[T1]).toEqual(ref(T1));
    tableError = null;
  });

  it("PL/EN messages parity for studio.cleanup", () => {
    expect(keys(pl.studio.cleanup)).toEqual(keys(en.studio.cleanup));
  });
});
