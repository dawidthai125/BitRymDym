/**
 * STUDIO_EXPORT Stage A — schema + TypeScript job-kind contract (unit / source).
 * Does not claim live Postgres constraint PASS; local Supabase/Docker may be unavailable.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isRenderJobKind,
  isValidRenderJobSourceXor,
} from "@/lib/audio/render-job-core";
import { RENDER_JOB_KINDS } from "@/types/domain";

const MIGRATION =
  "supabase/migrations/20261010010000_studio_export_render_job_kind.sql";
const P4_MIGRATION =
  "supabase/migrations/20261005230000_p4_recording_identity_download_foundation.sql";

const MIX_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TAKE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("STUDIO_EXPORT Stage A — TypeScript kind SSOT", () => {
  it("keeps MIX and TAKE_EXPORT; adds STUDIO_EXPORT", () => {
    expect(RENDER_JOB_KINDS).toEqual(["MIX", "TAKE_EXPORT", "STUDIO_EXPORT"]);
    expect(isRenderJobKind("MIX")).toBe(true);
    expect(isRenderJobKind("TAKE_EXPORT")).toBe(true);
    expect(isRenderJobKind("STUDIO_EXPORT")).toBe(true);
    expect(isRenderJobKind("STEMS")).toBe(false);
  });
});

describe("STUDIO_EXPORT Stage A — source XOR (TS mirror)", () => {
  it("accepts MIX with mix_session_id only", () => {
    expect(
      isValidRenderJobSourceXor({
        kind: "MIX",
        mixSessionId: MIX_ID,
        takeId: null,
        projectId: null,
      }),
    ).toBe(true);
  });

  it("accepts TAKE_EXPORT with take_id only", () => {
    expect(
      isValidRenderJobSourceXor({
        kind: "TAKE_EXPORT",
        mixSessionId: null,
        takeId: TAKE_ID,
        projectId: null,
      }),
    ).toBe(true);
  });

  it("requires project_id for STUDIO_EXPORT", () => {
    expect(
      isValidRenderJobSourceXor({
        kind: "STUDIO_EXPORT",
        mixSessionId: null,
        takeId: null,
        projectId: null,
      }),
    ).toBe(false);
    expect(
      isValidRenderJobSourceXor({
        kind: "STUDIO_EXPORT",
        mixSessionId: null,
        takeId: null,
        projectId: PROJECT_ID,
      }),
    ).toBe(true);
  });

  it("rejects illegal source combinations", () => {
    expect(
      isValidRenderJobSourceXor({
        kind: "MIX",
        mixSessionId: MIX_ID,
        takeId: TAKE_ID,
        projectId: null,
      }),
    ).toBe(false);
    expect(
      isValidRenderJobSourceXor({
        kind: "MIX",
        mixSessionId: MIX_ID,
        takeId: null,
        projectId: PROJECT_ID,
      }),
    ).toBe(false);
    expect(
      isValidRenderJobSourceXor({
        kind: "TAKE_EXPORT",
        mixSessionId: MIX_ID,
        takeId: TAKE_ID,
        projectId: null,
      }),
    ).toBe(false);
    expect(
      isValidRenderJobSourceXor({
        kind: "STUDIO_EXPORT",
        mixSessionId: MIX_ID,
        takeId: null,
        projectId: PROJECT_ID,
      }),
    ).toBe(false);
    expect(
      isValidRenderJobSourceXor({
        kind: "STUDIO_EXPORT",
        mixSessionId: null,
        takeId: TAKE_ID,
        projectId: PROJECT_ID,
      }),
    ).toBe(false);
  });

  it("treats legacy MIX/TAKE_EXPORT rows (project_id NULL) as valid", () => {
    expect(
      isValidRenderJobSourceXor({
        kind: "MIX",
        mixSessionId: MIX_ID,
        takeId: null,
        projectId: null,
      }),
    ).toBe(true);
    expect(
      isValidRenderJobSourceXor({
        kind: "TAKE_EXPORT",
        mixSessionId: null,
        takeId: TAKE_ID,
        projectId: null,
      }),
    ).toBe(true);
  });
});

describe("STUDIO_EXPORT Stage A — migration source contract", () => {
  it("adds STUDIO_EXPORT kind, project_id, XOR, and index without DROP TABLE", () => {
    const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8");
    expect(sql).toMatch(/STUDIO_EXPORT/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS project_id/);
    expect(sql).toMatch(/REFERENCES public\.studio_projects/);
    expect(sql).toMatch(/render_jobs_kind_chk/);
    expect(sql).toMatch(
      /kind IN \('MIX', 'TAKE_EXPORT', 'STUDIO_EXPORT'\)/,
    );
    expect(sql).toMatch(/render_jobs_source_xor_chk/);
    expect(sql).toMatch(
      /kind = 'STUDIO_EXPORT'[\s\S]*project_id IS NOT NULL/,
    );
    expect(sql).toMatch(
      /kind = 'MIX'[\s\S]*project_id IS NULL/,
    );
    expect(sql).toMatch(
      /kind = 'TAKE_EXPORT'[\s\S]*project_id IS NULL/,
    );
    expect(sql).toMatch(/render_jobs_project_id_idx/);
    expect(sql).not.toMatch(/DROP TABLE/);
    expect(sql).not.toMatch(/CREATE POLICY/);
    expect(sql).not.toMatch(/ALTER POLICY/);
  });

  it("does not rewrite P4 TAKE_EXPORT foundation migration", () => {
    const p4 = readFileSync(join(process.cwd(), P4_MIGRATION), "utf8");
    expect(p4).toMatch(/TAKE_EXPORT/);
    expect(p4).toMatch(
      /\(kind = 'MIX' AND mix_session_id IS NOT NULL AND take_id IS NULL\)/,
    );
    expect(p4).not.toMatch(/STUDIO_EXPORT/);
  });
});
