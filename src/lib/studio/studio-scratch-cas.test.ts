import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  nextAddTrackName,
  parseStudioAddTrackType,
  STUDIO_ADD_TRACK_DEFAULT_TYPE,
} from "@/lib/studio/studio-track-capacity";

const root = process.cwd();
const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20261028120000_studio_scratch_cas_sample_scratch.sql",
  ),
  "utf8",
);
const persist = readFileSync(
  join(root, "src/lib/studio/studio-scratch-persist.ts"),
  "utf8",
);
const service = readFileSync(
  join(root, "src/lib/studio/studio-service.ts"),
  "utf8",
);
const addRoute = readFileSync(
  join(root, "src/app/api/studio/projects/[projectId]/tracks/route.ts"),
  "utf8",
);
const clipRoute = readFileSync(
  join(
    root,
    "src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts",
  ),
  "utf8",
);

describe("Scratch CAS + SAMPLE/SCRATCH create", () => {
  it("add-track allowlist is VOCAL | SAMPLE | SCRATCH and inserts p_track_type", () => {
    expect(migration).toMatch(/p_track_type IS DISTINCT FROM 'SAMPLE'/);
    expect(migration).toMatch(/p_track_type IS DISTINCT FROM 'SCRATCH'/);
    expect(migration).toMatch(/p_track_type,/);
    expect(migration).not.toMatch(/VALUES \(\s*p_project_id,\s*btrim\(p_name\),\s*'VOCAL'/);
  });

  it("clip scratch RPC is service_role only with CAS empty-row conflict", () => {
    expect(migration).toMatch(/studio_cas_apply_clip_scratch/);
    expect(migration).toMatch(/scratch_cue_ms/);
    expect(migration).toMatch(/scratch_reverse/);
    expect(migration).toMatch(/scratch_rate/);
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]*studio_cas_apply_clip_scratch[\s\S]*TO service_role/);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.studio_cas_apply_clip_scratch[\s\S]*FROM anon, authenticated/,
    );
  });

  it("persist owns CAS write and add-track type parse", () => {
    expect(persist).toMatch(/studio_cas_apply_clip_scratch/);
    expect(persist).toMatch(/parseScratchApprovedForWrite/);
    expect(persist).toMatch(/parseStudioAddTrackType/);
    expect(persist).toMatch(/StudioFxCasConflictError/);
    expect(persist).not.toMatch(/mix-working-apply-service/);
  });

  it("service reuses persist helpers without mix-working apply", () => {
    expect(service).toMatch(/applyStudioClipScratchCas/);
    expect(service).toMatch(/resolveStudioAddTrackTypeForWrite/);
    expect(service).toMatch(/StudioFxCasConflictError/);
    expect(service).toMatch(/p_track_type: trackType/);
    expect(service).not.toMatch(/mix-working-apply-service/);
  });

  it("routes accept trackType and set_scratch", () => {
    expect(addRoute).toMatch(/trackType: body\.trackType/);
    expect(clipRoute).toMatch(/set_scratch/);
    expect(clipRoute).toMatch(/updateStudioClipScratch/);
  });

  it("parse add-track type defaults to VOCAL and rejects BEAT", () => {
    expect(parseStudioAddTrackType(undefined)).toBe(
      STUDIO_ADD_TRACK_DEFAULT_TYPE,
    );
    expect(parseStudioAddTrackType("SAMPLE")).toBe("SAMPLE");
    expect(parseStudioAddTrackType("SCRATCH")).toBe("SCRATCH");
    expect(() => parseStudioAddTrackType("BEAT")).toThrow("TRACK_TYPE_INVALID");
    expect(nextAddTrackName("SAMPLE", [])).toBe("Sample");
    expect(nextAddTrackName("SCRATCH", ["Scratch"])).toBe("Scratch 2");
  });
});
