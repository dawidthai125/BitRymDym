import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STUDIO_TRACK_ROLES,
  defaultStudioTrackRole,
  isStudioTrackRole,
} from "@/config/studio";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("Stage 0 track roles", () => {
  it("has the 7 roles and sane defaults", () => {
    expect(STUDIO_TRACK_ROLES).toEqual([
      "lead_vocal",
      "adlib",
      "double",
      "backing",
      "beat",
      "instrument",
      "other",
    ]);
    expect(defaultStudioTrackRole("VOCAL")).toBe("lead_vocal");
    expect(defaultStudioTrackRole("BEAT")).toBe("beat");
    expect(defaultStudioTrackRole("GUITAR")).toBe("instrument");
    expect(defaultStudioTrackRole("SCRATCH")).toBe("other");
    expect(isStudioTrackRole("adlib")).toBe(true);
    expect(isStudioTrackRole("bogus")).toBe(false);
    expect(isStudioTrackRole(null)).toBe(false);
  });

  it("migration: one column, CHECK matching config, default trigger, CAS RPC service_role only", () => {
    const file = readdirSync(join(root, "supabase/migrations")).find((f) =>
      f.endsWith("_studio_track_role.sql"),
    );
    expect(file).toBeTruthy();
    const sql = read(`supabase/migrations/${file}`);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS track_role text/);
    for (const role of STUDIO_TRACK_ROLES) expect(sql).toContain(`'${role}'`);
    expect(sql).toMatch(/studio_tracks_role_chk CHECK/);
    expect(sql).toMatch(/BEFORE INSERT ON public\.studio_tracks/);
    expect(sql).toMatch(/document_version = p_expected/);
    expect(sql).toMatch(/FROM anon, authenticated/);
    expect(sql).toMatch(/TO service_role/);
  });

  it("API + service accept trackRole; DTO falls back when column missing", () => {
    expect(read("src/app/api/studio/projects/[projectId]/tracks/[trackId]/route.ts")).toMatch(
      /trackRole: body\.trackRole/,
    );
    const service = read("src/lib/studio/studio-service.ts");
    expect(service).toMatch(/studio_cas_set_track_role/);
    expect(service).toMatch(/defaultStudioTrackRole\(row\.track_type\)/);
  });

  it("track header exposes a role picker persisted via patchTrack", () => {
    const editor = read("src/components/studio/studio-editor.tsx");
    expect(editor).toMatch(/data-testid="studio-track-role"/);
    expect(editor).toMatch(/patchTrack\(track\.id, \{ trackRole: next \}\)/);
  });
});
