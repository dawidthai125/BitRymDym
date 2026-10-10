/**
 * STUDIO_EXPORT Stage G — artifact model, object key, bake dispatcher contracts.
 * Unit / source only — no Storage, worker, Contabo, or live DB writes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildStudioExportArtifactObjectKey,
  buildTakeExportArtifactObjectKey,
  buildAudioArtifactObjectKey,
  expectedStudioExportArtifactObjectKey,
} from "@/lib/audio/artifact-object-key";
import { STUDIO_EXPORT_FX_POST_ROLL_MAX_MS } from "@/config/audio-render";

const ARTIFACT_MIGRATION =
  "supabase/migrations/20261010030000_studio_export_audio_artifacts.sql";
const PIPELINE = "src/lib/audio/render-worker-pipeline.ts";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JOB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MIX = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TAKE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

describe("STUDIO_EXPORT Stage G — audio_artifacts migration contract", () => {
  const sql = readFileSync(join(process.cwd(), ARTIFACT_MIGRATION), "utf8");

  it("adds project_id FK to studio_projects", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS project_id uuid/);
    expect(sql).toMatch(/REFERENCES public\.studio_projects/);
  });

  it("defines ternary XOR for mix / take / project", () => {
    expect(sql).toMatch(/audio_artifacts_source_xor_chk/);
    expect(sql).toMatch(/mix_session_id IS NOT NULL/);
    expect(sql).toMatch(/take_id IS NOT NULL/);
    expect(sql).toMatch(/project_id IS NOT NULL/);
    expect(sql).toMatch(
      /project_id IS NOT NULL[\s\S]*mix_session_id IS NULL[\s\S]*take_id IS NULL/,
    );
  });

  it("indexes project_id and keeps render_job uniqueness comment", () => {
    expect(sql).toMatch(/audio_artifacts_project_id_idx/);
    expect(sql).toMatch(/Unique render_job_id/);
  });
});

describe("STUDIO_EXPORT Stage G — object key OD-SFM-F02", () => {
  it("builds canonical studio-export WAV key", () => {
    expect(
      buildStudioExportArtifactObjectKey({
        ownerId: OWNER,
        projectId: PROJECT,
        jobId: JOB,
      }),
    ).toBe(`user/${OWNER}/studio-export/${PROJECT}/jobs/${JOB}/WAV.wav`);
  });

  it("rejects non-WAV MVP tier and invalid uuids", () => {
    expect(() =>
      buildStudioExportArtifactObjectKey({
        ownerId: OWNER,
        projectId: PROJECT,
        jobId: JOB,
        tier: "BASIC_MP3",
      }),
    ).toThrow(/WAV/);
    expect(() =>
      buildStudioExportArtifactObjectKey({
        ownerId: "not-a-uuid",
        projectId: PROJECT,
        jobId: JOB,
      }),
    ).toThrow(/uuid/);
  });

  it("does not collide with MIX or TAKE_EXPORT prefixes", () => {
    const studio = buildStudioExportArtifactObjectKey({
      ownerId: OWNER,
      projectId: PROJECT,
      jobId: JOB,
    });
    const mix = buildAudioArtifactObjectKey({
      ownerId: OWNER,
      mixSessionId: MIX,
      jobId: JOB,
      tier: "WAV",
    });
    const take = buildTakeExportArtifactObjectKey({
      ownerId: OWNER,
      takeId: TAKE,
      jobId: JOB,
      tier: "WAV",
    });
    expect(studio).not.toBe(mix);
    expect(studio).not.toBe(take);
    expect(studio).toContain("/studio-export/");
    expect(mix).toContain("/mix/");
    expect(take).toContain("/take-export/");
    expect(
      expectedStudioExportArtifactObjectKey({
        ownerId: OWNER,
        projectId: PROJECT,
        jobId: JOB,
        objectKey: studio,
      }),
    ).toBe(true);
    expect(
      expectedStudioExportArtifactObjectKey({
        ownerId: OWNER,
        projectId: PROJECT,
        jobId: JOB,
        objectKey: mix,
      }),
    ).toBe(false);
  });
});

describe("STUDIO_EXPORT Stage G — worker bake wiring (source contract)", () => {
  const src = readFileSync(join(process.cwd(), PIPELINE), "utf8");

  it("dispatches STUDIO_EXPORT to bake path (not DISABLED)", () => {
    expect(src).toMatch(/runClaimedStudioExportWorkerJob/);
    expect(src).toMatch(/renderStudioDocumentOffline/);
    expect(src).toMatch(/planStudioExportDuration/);
    expect(src).toMatch(/encodeWavFromBake/);
    expect(src).toMatch(/artifactMode:\s*"STUDIO_EXPORT"/);
    expect(src).not.toMatch(
      /STUDIO_EXPORT bake is not implemented \(Stage B/,
    );
  });

  it("fail-closes unknown kinds instead of falling through to MIX", () => {
    expect(src).toMatch(/Unsupported render job kind/);
    expect(src).toMatch(/job\.kind !== "MIX"/);
  });

  it("uses upsert for Studio Storage and project_id on insert", () => {
    expect(src).toMatch(/upsert: mode === "STUDIO_EXPORT"/);
    expect(src).toMatch(/project_id: projectIdForInsert/);
    expect(src).toMatch(/buildStudioExportArtifactObjectKey/);
  });

  it("documents post-roll max constant", () => {
    expect(STUDIO_EXPORT_FX_POST_ROLL_MAX_MS).toBe(3000);
  });
});
