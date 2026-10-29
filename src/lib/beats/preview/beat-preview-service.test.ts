import { writeFile } from "node:fs/promises";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { previewSourceMarker } from "@/lib/beats/preview/beat-preview";
import {
  ensureBeatPreviewAsset,
  listBeatsNeedingPreview,
} from "@/lib/beats/preview/beat-preview-service";
import { createFakeAdmin, type FakeAsset } from "@/lib/beats/preview/fake-admin.test-helper";

const BEAT = "11111111-1111-4111-8111-111111111111";
const OWNER = "33333333-3333-4333-8333-333333333333";
const MKEY = `platform/${BEAT}/m1/master.bin`;

function master(id = "m1"): FakeAsset {
  return { id, beat_id: BEAT, purpose: "MASTER", status: "READY", is_active: true, object_key: MKEY, storage_bucket: "beat-audio", original_filename: "x.wav" };
}
function preview(id: string, of: string): FakeAsset {
  return { id, beat_id: BEAT, purpose: "PREVIEW", status: "READY", is_active: true, object_key: `platform/${BEAT}/${id}/preview.bin`, storage_bucket: "beat-audio", original_filename: previewSourceMarker(of) };
}
const fakeFfmpeg = async (args: string[]) => {
  await writeFile(args.at(-1)!, Buffer.from("ID3fake-mp3-bytes"));
};
const deps = (admin: unknown) => ({
  admin: admin as SupabaseClient,
  runFfmpeg: fakeFfmpeg,
  probeDuration: async () => 180,
});

describe("ensureBeatPreviewAsset", () => {
  it("creates an inactive READY row, then activates it (PLATFORM key, mp3)", async () => {
    const f = createFakeAdmin({ beats: [{ id: BEAT, ownership_type: "PLATFORM", owner_id: null }], assets: [master()], objects: { [MKEY]: Buffer.from("wav") } });
    const r = await ensureBeatPreviewAsset(deps(f.admin), { beatId: BEAT });
    expect(r.outcome).toBe("created");
    const row = f.assets.find((a) => a.purpose === "PREVIEW")!;
    expect(row).toMatchObject({ is_active: true, status: "READY", content_type: "audio/mpeg", original_filename: previewSourceMarker("m1") });
    expect(row.object_key).toBe(`platform/${BEAT}/${row.id}/preview.bin`);
    expect(f.log[0]).toMatch(/^upload:platform\/.+\/preview\.bin:audio\/mpeg$/);
    expect(f.log[1]).toBe(`insert:${row.id}`);
    expect(f.log[2]).toContain(`update:${row.id}:{"is_active":true}`);
  });

  it("USER beat preview lives under user/{ownerId}/", async () => {
    const f = createFakeAdmin({ beats: [{ id: BEAT, ownership_type: "USER", owner_id: OWNER }], assets: [master()], objects: { [MKEY]: Buffer.from("wav") } });
    await ensureBeatPreviewAsset(deps(f.admin), { beatId: BEAT });
    expect(f.assets.find((a) => a.purpose === "PREVIEW")!.object_key.startsWith(`user/${OWNER}/${BEAT}/`)).toBe(true);
  });

  it("skips a fresh preview; dry run never writes", async () => {
    const f = createFakeAdmin({ beats: [{ id: BEAT, ownership_type: "PLATFORM", owner_id: null }], assets: [master(), preview("p1", "m1")] });
    expect((await ensureBeatPreviewAsset(deps(f.admin), { beatId: BEAT })).outcome).toBe("skipped_fresh");
    expect((await ensureBeatPreviewAsset(deps(f.admin), { beatId: BEAT, force: true, dryRun: true })).outcome).toBe("would_replace");
    expect(f.log).toEqual([]);
  });

  it("stale preview (master replaced) → old REPLACED before new is activated", async () => {
    const f = createFakeAdmin({ beats: [{ id: BEAT, ownership_type: "PLATFORM", owner_id: null }], assets: [master("m2"), preview("p1", "m1")], objects: { [MKEY]: Buffer.from("wav") } });
    const r = await ensureBeatPreviewAsset(deps(f.admin), { beatId: BEAT });
    expect(r.outcome).toBe("replaced");
    const old = f.assets.find((a) => a.id === "p1")!;
    expect(old).toMatchObject({ is_active: false, status: "REPLACED", replaced_by_asset_id: r.previewAssetId });
    const active = f.assets.filter((a) => a.purpose === "PREVIEW" && a.is_active);
    expect(active.map((a) => a.id)).toEqual([r.previewAssetId]);
  });

  it("insert failure removes the uploaded object; no row left", async () => {
    const f = createFakeAdmin({ beats: [{ id: BEAT, ownership_type: "PLATFORM", owner_id: null }], assets: [master()], objects: { [MKEY]: Buffer.from("wav") }, failInsert: true });
    const r = await ensureBeatPreviewAsset(deps(f.admin), { beatId: BEAT });
    expect(r).toMatchObject({ outcome: "failed", errorCode: "asset_insert_failed" });
    expect(f.log.some((l) => l.startsWith("remove:"))).toBe(true);
    expect(Object.keys(f.objects)).toEqual([MKEY]);
  });

  it("activation failure restores the previous preview", async () => {
    const f = createFakeAdmin({ beats: [{ id: BEAT, ownership_type: "PLATFORM", owner_id: null }], assets: [master("m2"), preview("p1", "m1")], objects: { [MKEY]: Buffer.from("wav") }, failActivate: true });
    const r = await ensureBeatPreviewAsset(deps(f.admin), { beatId: BEAT });
    expect(r).toMatchObject({ outcome: "failed", errorCode: "activate_failed" });
    expect(f.assets.find((a) => a.id === "p1")).toMatchObject({ is_active: true, status: "READY" });
  });

  it("no master / ffmpeg failure → failed with a code, nothing uploaded", async () => {
    const f = createFakeAdmin({ beats: [{ id: BEAT, ownership_type: "PLATFORM", owner_id: null }], assets: [] });
    expect((await ensureBeatPreviewAsset(deps(f.admin), { beatId: BEAT })).errorCode).toBe("master_missing");
    const g = createFakeAdmin({ beats: [{ id: BEAT, ownership_type: "PLATFORM", owner_id: null }], assets: [master()], objects: { [MKEY]: Buffer.from("wav") } });
    const r = await ensureBeatPreviewAsset({ ...deps(g.admin), runFfmpeg: async () => { throw new Error("boom"); } }, { beatId: BEAT });
    expect(r.errorCode).toBe("ffmpeg_failed");
    expect(g.log).toEqual([]);
  });

  it("listBeatsNeedingPreview: published beats with a master and a missing/stale preview", async () => {
    const B2 = "22222222-2222-4222-8222-222222222222";
    const f = createFakeAdmin({
      beats: [
        { id: BEAT, ownership_type: "PLATFORM", owner_id: null, status: "PUBLISHED" },
        { id: B2, ownership_type: "PLATFORM", owner_id: null, status: "PUBLISHED" },
      ],
      assets: [master("m1"), preview("p1", "m1"), { ...master("m9"), beat_id: B2 }],
    });
    expect(await listBeatsNeedingPreview(f.admin as unknown as SupabaseClient)).toEqual([B2]);
  });
});
